import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import {
  BACKOFF_MS,
  claimDueEmails,
  emailCounts,
  enqueueEmail,
  LEASE_MS,
  listEmails,
  markEmailFailed,
  markEmailSent,
  MAX_ATTEMPTS,
  processQueue,
  releaseBackoff,
  recordDirectEmail,
  resendEmail,
} from "@/server/email/queue";
import { createTestDb } from "./helpers/db";

let db: Db;
const T0 = new Date("2026-10-05T04:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

const base = { toEmail: "ana@example.com", subject: "Your statement", payload: { amount: "₱75.50" } };
const rowOf = (id: string) => db.select().from(s.emailLogs).where(eq(s.emailLogs.id, id)).get()!;

function queue(type: typeof s.emailLogs.$inferInsert["type"], dedupeKey: string, over: Partial<Parameters<typeof enqueueEmail>[1]> = {}) {
  const res = enqueueEmail(db, { ...base, type, dedupeKey, now: T0, ...over });
  if (!res.queued) throw new Error("expected a new row");
  return res.id;
}

beforeEach(() => {
  db = createTestDb();
});

describe("enqueueEmail", () => {
  it("stores a pending message ready to send now", () => {
    const id = queue("SOA_GENERATED", "SOA:1");
    expect(rowOf(id)).toMatchObject({ status: "PENDING", attempts: 0, toEmail: "ana@example.com", subject: "Your statement", lastError: null, sentAt: null });
    expect(JSON.parse(rowOf(id).payload)).toEqual({ amount: "₱75.50" });
    expect(rowOf(id).nextAttemptAt).toEqual(T0);
  });

  it("never queues the same event twice (duplicate prevention by dedupe key)", () => {
    queue("SOA_GENERATED", "SOA:1");
    expect(enqueueEmail(db, { ...base, type: "SOA_GENERATED", dedupeKey: "SOA:1", now: T0 })).toEqual({ queued: false });
    expect(db.select().from(s.emailLogs).all()).toHaveLength(1);
    expect(enqueueEmail(db, { ...base, type: "SOA_GENERATED", dedupeKey: "SOA:2", now: T0 }).queued).toBe(true);
  });
});

describe("claimDueEmails", () => {
  it("claims due messages oldest first, marks them SENDING, counts the attempt, and never hands them out twice", () => {
    const later = queue("DUE_TODAY", "D:2", { now: at(1000) });
    const first = queue("DUE_TODAY", "D:1", { now: T0 });
    const claimed = claimDueEmails(db, at(2000), 10);
    expect(claimed.map((r) => r.id)).toEqual([first, later]);
    expect(rowOf(first)).toMatchObject({ status: "SENDING", attempts: 1 });
    expect(claimDueEmails(db, at(2000), 10)).toEqual([]);
  });

  it("leaves messages that are not due yet, and honours the limit", () => {
    queue("DUE_TODAY", "D:1", { now: at(60_000) });
    expect(claimDueEmails(db, T0, 10)).toEqual([]);
    queue("DUE_TODAY", "D:2", { now: T0 });
    queue("DUE_TODAY", "D:3", { now: T0 });
    expect(claimDueEmails(db, at(120_000), 2)).toHaveLength(2);
  });

  it("recovers a message whose sender crashed mid-send once the lease runs out", () => {
    const id = queue("DUE_TODAY", "D:1");
    claimDueEmails(db, T0, 10); // crash: never marked sent or failed
    expect(claimDueEmails(db, at(LEASE_MS - 1), 10)).toEqual([]);
    expect(claimDueEmails(db, at(LEASE_MS + 1), 10).map((r) => r.id)).toEqual([id]);
    expect(rowOf(id).attempts).toBe(2);
  });
});

describe("a sender that keeps crashing", () => {
  it(`is marked FAILED instead of being reclaimed past ${MAX_ATTEMPTS} attempts`, () => {
    const id = queue("DUE_TODAY", "D:1");
    let now = T0;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      expect(claimDueEmails(db, now, 10)).toHaveLength(1); // claimed, then the process dies: never marked
      now = at((i + 1) * (LEASE_MS + 1000));
    }
    expect(claimDueEmails(db, now, 10)).toEqual([]);
    expect(rowOf(id)).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS, lastError: "The sender stopped before finishing" });
  });
});

describe("markEmailSent", () => {
  it("records SENT with a timestamp (accepted by the mail server, never 'delivered')", () => {
    const id = queue("SOA_GENERATED", "SOA:1");
    claimDueEmails(db, T0, 10);
    markEmailSent(db, id, at(5000));
    expect(rowOf(id)).toMatchObject({ status: "SENT", sentAt: at(5000), lastError: null });
    expect(s.EMAIL_STATUSES).not.toContain("DELIVERED");
  });

  it("keeps the payload so the message can be resent", () => {
    const id = queue("SOA_GENERATED", "SOA:1");
    claimDueEmails(db, T0, 10);
    markEmailSent(db, id, at(1000));
    expect(JSON.parse(rowOf(id).payload)).toEqual({ amount: "₱75.50" });
  });
});

describe("markEmailFailed: retry with backoff, then give up", () => {
  it("schedules a retry after the first failure and records why", () => {
    const id = queue("SOA_GENERATED", "SOA:1");
    claimDueEmails(db, T0, 10);
    markEmailFailed(db, id, "connect ETIMEDOUT", at(1000));
    expect(rowOf(id)).toMatchObject({ status: "PENDING", attempts: 1, lastError: "connect ETIMEDOUT" });
    expect(rowOf(id).nextAttemptAt).toEqual(at(1000 + BACKOFF_MS[0]));
    // Not due again until the backoff has passed.
    expect(claimDueEmails(db, at(1000 + BACKOFF_MS[0] - 1), 10)).toEqual([]);
    expect(claimDueEmails(db, at(1000 + BACKOFF_MS[0]), 10)).toHaveLength(1);
  });

  it(`gives up as FAILED after ${MAX_ATTEMPTS} attempts and never retries again`, () => {
    const id = queue("SOA_GENERATED", "SOA:1");
    let now = T0;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      now = at(attempt * 24 * 3600_000);
      expect(claimDueEmails(db, now, 10)).toHaveLength(1);
      markEmailFailed(db, id, `boom ${attempt}`, now);
    }
    expect(rowOf(id)).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS, lastError: `boom ${MAX_ATTEMPTS}` });
    expect(claimDueEmails(db, at(365 * 24 * 3600_000), 10)).toEqual([]);
  });

  it("truncates a very long error so the log stays readable", () => {
    const id = queue("SOA_GENERATED", "SOA:1");
    claimDueEmails(db, T0, 10);
    markEmailFailed(db, id, "x".repeat(5000), T0);
    expect(rowOf(id).lastError!.length).toBeLessThanOrEqual(500);
  });
});

describe("processQueue", () => {
  it("sends what is due and reports the outcome; one failure doesn't stop the others", async () => {
    const ok = queue("SOA_GENERATED", "SOA:1");
    const bad = queue("DUE_TODAY", "D:1", { toEmail: "bad@example.com" });
    const result = await processQueue(db, async (row) => {
      if (row.toEmail === "bad@example.com") throw new Error("550 mailbox unavailable");
    }, { now: at(1000) });
    expect(result).toEqual({ sent: 1, retrying: 1, failed: 0 });
    expect(rowOf(ok).status).toBe("SENT");
    expect(rowOf(bad)).toMatchObject({ status: "PENDING", attempts: 1, lastError: "550 mailbox unavailable" });
  });

  it("counts a final failure separately", async () => {
    const id = queue("DUE_TODAY", "D:1");
    db.update(s.emailLogs).set({ attempts: MAX_ATTEMPTS - 1 }).where(eq(s.emailLogs.id, id)).run();
    const result = await processQueue(db, async () => { throw new Error("nope"); }, { now: at(1000) });
    expect(result).toEqual({ sent: 0, retrying: 0, failed: 1 });
    expect(rowOf(id).status).toBe("FAILED");
  });

  it("an email failure never touches billing data (the queue is its own table)", async () => {
    const user = db.insert(s.users).values({ email: "ana@example.com" }).returning().get();
    queue("DUE_TODAY", "D:1");
    await processQueue(db, async () => { throw new Error("smtp down"); }, { now: at(1000) });
    expect(db.select().from(s.users).where(eq(s.users.id, user.id)).get()).toBeTruthy();
    expect(db.select().from(s.statements).all()).toEqual([]);
  });
});

describe("resendEmail (administrator-initiated)", () => {
  it("queues a fresh copy of a failed notification and keeps the original as history", () => {
    const id = queue("SOA_GENERATED", "SOA:1");
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      claimDueEmails(db, at((i + 1) * 24 * 3600_000), 10);
      markEmailFailed(db, id, "boom", at((i + 1) * 24 * 3600_000));
    }
    const res = resendEmail(db, id, at(10 * 24 * 3600_000));
    expect(res.ok).toBe(true);
    expect(db.select().from(s.emailLogs).all()).toHaveLength(2);
    expect(rowOf(id).status).toBe("FAILED");
    if (!res.ok) return;
    expect(rowOf(res.id)).toMatchObject({ status: "PENDING", attempts: 0, toEmail: "ana@example.com", type: "SOA_GENERATED" });
    expect(JSON.parse(rowOf(res.id).payload)).toEqual({ amount: "₱75.50" });
  });

  it("can resend one that was sent but never arrived", () => {
    const id = queue("DUE_TODAY", "D:1");
    claimDueEmails(db, T0, 10);
    markEmailSent(db, id, T0);
    expect(resendEmail(db, id, at(1000)).ok).toBe(true);
  });

  it("refuses sign-in and invitation mail (the one-time link was never stored; send a new one) and unknown ids", () => {
    recordDirectEmail(db, { type: "INVITATION", toEmail: "ana@example.com", subject: "You're invited", now: T0 });
    const id = db.select().from(s.emailLogs).get()!.id;
    expect(resendEmail(db, id, T0)).toEqual({ ok: false, error: "NOT_RESENDABLE" });
    expect(resendEmail(db, "nope", T0)).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("refuses a message that is still waiting or being sent", () => {
    const id = queue("DUE_TODAY", "D:1");
    expect(resendEmail(db, id, T0)).toEqual({ ok: false, error: "STILL_ACTIVE" });
  });
});

describe("releaseBackoff (admin 'send now' after fixing SMTP)", () => {
  it("makes retry-waiting messages due immediately, without touching sent, failed or in-flight ones", () => {
    const waiting = queue("DUE_TODAY", "D:1");
    claimDueEmails(db, T0, 10);
    markEmailFailed(db, waiting, "ECONNREFUSED", T0); // retry in 1 minute
    const done = queue("DUE_TODAY", "D:2");
    claimDueEmails(db, at(1000), 10);
    markEmailSent(db, done, at(1000));
    const inFlight = queue("DUE_TODAY", "D:3", { now: at(2000) });
    claimDueEmails(db, at(2000), 10);

    expect(claimDueEmails(db, at(5000), 10)).toEqual([]);
    expect(releaseBackoff(db, at(5000))).toBe(1);
    expect(claimDueEmails(db, at(5000), 10).map((r) => r.id)).toEqual([waiting]);
    expect(rowOf(done).status).toBe("SENT");
    expect(rowOf(inFlight).status).toBe("SENDING");
  });
});

describe("recordDirectEmail", () => {
  it("logs a sent sign-in mail without any link", () => {
    recordDirectEmail(db, { type: "LOGIN", toEmail: "ana@example.com", subject: "Your ambagan sign-in link", now: T0 });
    expect(db.select().from(s.emailLogs).get()).toMatchObject({ type: "LOGIN", status: "SENT", payload: "{}", sentAt: T0, lastError: null });
  });

  it("logs a failure with its error, and each call is a separate row", () => {
    recordDirectEmail(db, { type: "INVITATION", toEmail: "ana@example.com", subject: "x", error: "ECONNREFUSED", now: T0 });
    recordDirectEmail(db, { type: "INVITATION", toEmail: "ana@example.com", subject: "x", now: T0 });
    const rows = db.select().from(s.emailLogs).all();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.status === "FAILED")).toMatchObject({ lastError: "ECONNREFUSED", sentAt: null });
  });
});

describe("listEmails / emailCounts", () => {
  it("lists newest first, can filter by status, and counts each state", () => {
    const a = queue("DUE_TODAY", "D:1", { now: T0 });
    queue("DUE_TODAY", "D:2", { now: at(1000) });
    claimDueEmails(db, at(2000), 1);
    markEmailSent(db, a, at(2000));
    expect(listEmails(db, { limit: 10 }).map((r) => r.dedupeKey)).toEqual(["D:2", "D:1"]);
    expect(listEmails(db, { status: "SENT", limit: 10 })).toHaveLength(1);
    expect(emailCounts(db)).toEqual({ PENDING: 1, SENDING: 0, SENT: 1, FAILED: 0 });
  });
});
