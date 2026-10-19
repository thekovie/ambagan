import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { dueDateOf } from "@/server/billing/dates";
import { daysBetween, manilaDateKey, previousPeriod } from "@/server/billing/period";
import { cancelStatement } from "@/server/billing/statements";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { generateStatements } from "@/server/billing/generate";
import { reconcile } from "@/server/jobs/reconcile";
import { FAILED_RETRY_MS, STALE_RUN_MS, runJob } from "@/server/jobs/runner";
import { RECONCILE_HOUR_MANILA, shouldRunDaily } from "@/server/jobs/schedule";
import { parsePaymentForm } from "@/server/payments/form";
import { submitPayment } from "@/server/payments/submit";
import { declinePayment } from "@/server/payments/verify";
import { createTestDb } from "./helpers/db";

// Manila is UTC+8: "08:00 Manila" is 00:00 UTC.
const manila = (iso: string) => new Date(`${iso}+08:00`);

let db: Db;
let admin: typeof s.users.$inferSelect;
let ana: typeof s.users.$inferSelect;
let ben: typeof s.users.$inferSelect;
let spotify: typeof s.subscriptions.$inferSelect;
let gcash: typeof s.paymentMethods.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  admin = db.insert(s.users).values({ email: "boss@example.com", name: "Boss", role: "ADMIN" }).returning().get();
  ana = db.insert(s.users).values({ email: "ana@example.com", name: "Ana" }).returning().get();
  ben = db.insert(s.users).values({ email: "ben@example.com", name: "Ben" }).returning().get();
  spotify = db.insert(s.subscriptions).values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 7550, issueDay: 1, dueDay: 10 }).returning().get();
  gcash = db.insert(s.paymentMethods).values({ kind: "GCASH", label: "GCash", accountName: "Kovie D.", accountNumber: "0917", isActive: true }).returning().get();
  for (const u of [ana, ben]) {
    db.insert(s.memberships).values({ userId: u.id, subscriptionId: spotify.id, startPeriod: "2026-01" }).run();
  }
});

const statements = () => db.select().from(s.statements).all();
const emails = (type?: string) => db.select().from(s.emailLogs).all().filter((e) => !type || e.type === type);
const statementOf = (userId: string, period = "2026-10") => statements().find((st) => st.userId === userId && st.period === period)!;

describe("Manila date helpers", () => {
  it("reads the Manila calendar day, not the UTC one", () => {
    expect(manilaDateKey(new Date("2026-10-31T17:00:00Z"))).toBe("2026-11-01"); // 01:00 in Manila
    expect(manilaDateKey(new Date("2026-10-31T15:59:59Z"))).toBe("2026-10-31");
  });
  it("finds the previous billing month, across a year end", () => {
    expect(previousPeriod("2026-10")).toBe("2026-09");
    expect(previousPeriod("2026-01")).toBe("2025-12");
  });
  it("counts whole days between two keys, across month ends", () => {
    expect(daysBetween("2026-10-09", "2026-10-10")).toBe(1);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(daysBetween("2026-10-10", "2026-10-10")).toBe(0);
    expect(daysBetween("2026-10-12", "2026-10-10")).toBe(-2);
  });
});

describe("reconcile: statement generation", () => {
  it("issues this month's statements to every active member and emails each of them", () => {
    const summary = reconcile(db, manila("2026-10-01T08:00:00"));
    expect(statements()).toHaveLength(2);
    expect(summary).toMatchObject({ period: "2026-10", created: 2 });
    expect(emails("SOA_GENERATED").map((e) => e.toEmail).sort()).toEqual(["ana@example.com", "ben@example.com"]);
    expect(statementOf(ana.id)).toMatchObject({ amountMinor: 7550, status: "UNPAID" });
  });

  it("waits for the plan's issue day", () => {
    db.update(s.subscriptions).set({ issueDay: 5 }).where(eq(s.subscriptions.id, spotify.id)).run();
    expect(reconcile(db, manila("2026-10-04T08:00:00")).created).toBe(0);
    expect(statements()).toHaveLength(0);
    expect(reconcile(db, manila("2026-10-05T08:00:00")).created).toBe(2);
  });

  it("is safe to run any number of times: no duplicate statements, no duplicate emails", () => {
    reconcile(db, manila("2026-10-01T08:00:00"));
    const again = reconcile(db, manila("2026-10-01T09:00:00"));
    expect(again.created).toBe(0);
    expect(statements()).toHaveLength(2);
    expect(emails("SOA_GENERATED")).toHaveLength(2);
  });

  it("catches up after downtime: a run on the 20th still issues the month's statements", () => {
    expect(reconcile(db, manila("2026-10-20T08:00:00")).created).toBe(2);
    expect(statementOf(ana.id).dueAt).toEqual(dueDateOf("2026-10", 10));
  });

  it("uses the Manila month, not the UTC month, at the month boundary", () => {
    reconcile(db, new Date("2026-10-31T17:00:00Z")); // Nov 1, 01:00 in Manila
    expect(statements().map((st) => st.period)).toEqual(["2026-11", "2026-11"]);
  });

  it("skips deactivated members", () => {
    db.update(s.users).set({ isActive: false }).where(eq(s.users.id, ben.id)).run();
    reconcile(db, manila("2026-10-01T08:00:00"));
    expect(statements().map((st) => st.userId)).toEqual([ana.id]);
    expect(emails("SOA_GENERATED").map((e) => e.toEmail)).toEqual(["ana@example.com"]);
  });

  it("skips inactive plans", () => {
    db.update(s.subscriptions).set({ isActive: false }).where(eq(s.subscriptions.id, spotify.id)).run();
    expect(reconcile(db, manila("2026-10-01T08:00:00")).created).toBe(0);
  });
});

describe("reconcile: overdue status", () => {
  beforeEach(() => {
    reconcile(db, manila("2026-10-01T08:00:00"));
  });

  it("keeps a statement unpaid through its whole due day and flips it the next day (Manila)", () => {
    reconcile(db, manila("2026-10-10T23:59:00"));
    expect(statementOf(ana.id).status).toBe("UNPAID");
    const summary = reconcile(db, manila("2026-10-11T00:01:00"));
    expect(statementOf(ana.id).status).toBe("OVERDUE");
    expect(summary.markedOverdue).toBe(2);
  });

  it("leaves a statement that is under verification alone", () => {
    const st = statementOf(ana.id);
    db.update(s.statements).set({ status: "UNDER_VERIFICATION" }).where(eq(s.statements.id, st.id)).run();
    reconcile(db, manila("2026-10-15T08:00:00"));
    expect(statementOf(ana.id).status).toBe("UNDER_VERIFICATION");
  });
});

describe("reconcile: reminders", () => {
  const typesOn = (iso: string) => {
    const before = emails().length;
    reconcile(db, manila(iso));
    return emails().slice(before).map((e) => e.type);
  };

  beforeEach(() => {
    reconcile(db, manila("2026-10-01T08:00:00"));
  });

  it("nudges the day before, on the due day, and the day after", () => {
    expect(typesOn("2026-10-08T08:00:00")).toEqual([]);
    expect(typesOn("2026-10-09T08:00:00")).toEqual(["DUE_TOMORROW", "DUE_TOMORROW"]);
    expect(typesOn("2026-10-10T08:00:00")).toEqual(["DUE_TODAY", "DUE_TODAY"]);
    expect(typesOn("2026-10-11T08:00:00")).toEqual(["OVERDUE", "OVERDUE"]);
  });

  it("then repeats the overdue notice weekly, not daily", () => {
    reconcile(db, manila("2026-10-11T08:00:00"));
    for (const day of ["12", "13", "14", "15", "16", "17"]) expect(typesOn(`2026-10-${day}T08:00:00`)).toEqual([]);
    expect(typesOn("2026-10-18T08:00:00")).toEqual(["OVERDUE", "OVERDUE"]);
  });

  it("stops the overdue notices after four, so nobody is nagged forever", () => {
    reconcile(db, manila("2026-10-11T08:00:00"));
    reconcile(db, manila("2026-10-18T08:00:00"));
    reconcile(db, manila("2026-10-25T08:00:00"));
    reconcile(db, manila("2026-11-01T08:00:00")); // 22 days late: the fourth notice
    reconcile(db, manila("2026-11-08T08:00:00")); // 29 days late: no more
    expect(emails("OVERDUE").filter((e) => e.toEmail === "ana@example.com")).toHaveLength(4);
  });

  it("sends the new-statement email even if the job missed a few days", () => {
    db.delete(s.emailLogs).run();
    reconcile(db, manila("2026-10-04T08:00:00")); // three days after issue
    expect(emails("SOA_GENERATED")).toHaveLength(2);
  });

  it("does not announce a back-filled old month as if it were new", () => {
    generateStatements(db, { period: "2026-07", now: manila("2026-10-19T09:00:00"), actorId: admin.id });
    reconcile(db, manila("2026-10-19T10:00:00"));
    expect(emails("SOA_GENERATED").filter((e) => JSON.parse(e.payload).period === "July 2026")).toHaveLength(0);
  });

  it("sends each reminder once even if the job runs several times that day", () => {
    reconcile(db, manila("2026-10-09T08:00:00"));
    reconcile(db, manila("2026-10-09T08:30:00"));
    reconcile(db, manila("2026-10-09T20:00:00"));
    expect(emails("DUE_TOMORROW")).toHaveLength(2);
  });

  it("never reminds a member whose statement is paid or under verification", () => {
    db.update(s.statements).set({ status: "UNDER_VERIFICATION" }).where(eq(s.statements.id, statementOf(ana.id).id)).run();
    db.update(s.statements).set({ status: "PAID", outstandingMinor: 0 }).where(eq(s.statements.id, statementOf(ben.id).id)).run();
    expect(typesOn("2026-10-09T08:00:00")).toEqual([]);
    expect(typesOn("2026-10-10T08:00:00")).toEqual([]);
    expect(typesOn("2026-10-11T08:00:00")).toEqual([]);
  });

  it("never reminds about a cancelled statement", () => {
    cancelStatement(db, { statementId: statementOf(ana.id).id, actorId: admin.id, reason: "Left the group" });
    const types = emails().filter((e) => e.toEmail === "ana@example.com").length;
    typesOn("2026-10-09T08:00:00");
    typesOn("2026-10-10T08:00:00");
    expect(emails().filter((e) => e.toEmail === "ana@example.com")).toHaveLength(types);
  });

  it("resumes reminding when a declined payment puts the statement back to unpaid", () => {
    const st = statementOf(ana.id);
    const reportedAt = manila("2026-10-08T12:00:00");
    const parsed = parsePaymentForm(
      { statementId: st.id, destinationMethodId: gcash.id, sendingApp: "Maya", amountPesos: "75.50", transactionRef: "REF 1111 2222", transactionDate: "2026-10-08T10:00", notes: "" },
      reportedAt,
    );
    if (!parsed.ok) throw new Error("setup");
    const sub = submitPayment(db, { userId: ana.id, input: parsed.value, now: reportedAt });
    if (!sub.ok) throw new Error("setup");

    expect(typesOn("2026-10-09T08:00:00")).toEqual(["DUE_TOMORROW"]); // Ben only: Ana's is under verification
    declinePayment(db, { paymentId: sub.payment.id, adminId: admin.id, reason: "Not in my GCash", now: manila("2026-10-10T07:00:00") });
    expect(typesOn("2026-10-10T08:00:00")).toEqual(["DUE_TODAY", "DUE_TODAY"]);
  });

  it("does not email deactivated members", () => {
    db.update(s.users).set({ isActive: false }).where(eq(s.users.id, ben.id)).run();
    reconcile(db, manila("2026-10-09T08:00:00"));
    expect(emails("DUE_TOMORROW").map((e) => e.toEmail)).toEqual(["ana@example.com"]);
  });

  it("puts the statement's own facts in the reminder", () => {
    reconcile(db, manila("2026-10-09T08:00:00"));
    const row = emails("DUE_TOMORROW").find((e) => e.toEmail === "ana@example.com")!;
    expect(JSON.parse(row.payload)).toMatchObject({ subscription: "Spotify", period: "October 2026", amount: "₱75.50", path: `/statements/${statementOf(ana.id).id}` });
    expect(row.statementId).toBe(statementOf(ana.id).id);
  });
});

describe("shouldRunDaily", () => {
  it(`waits for ${RECONCILE_HOUR_MANILA}:00 Manila`, () => {
    expect(shouldRunDaily(manila("2026-10-01T07:59:00"))).toBe(false);
    expect(shouldRunDaily(manila("2026-10-01T08:00:00"))).toBe(true);
    expect(shouldRunDaily(manila("2026-10-01T23:30:00"))).toBe(true); // catch-up if the app was down at 08:00
  });
});

describe("runJob", () => {
  const T = manila("2026-10-05T08:00:00");
  const ok = async () => ({ created: 2 });
  const runs = () => db.select().from(s.jobRuns).all();

  it("records a scheduled run with its summary", async () => {
    const res = await runJob(db, "daily", "SCHEDULED", ok, T);
    expect(res).toEqual({ ran: true, summary: { created: 2 } });
    expect(runs()).toHaveLength(1);
    expect(runs()[0]).toMatchObject({ job: "daily", trigger: "SCHEDULED", status: "SUCCEEDED", startedAt: T });
    expect(JSON.parse(runs()[0].summary)).toEqual({ created: 2 });
    expect(runs()[0].finishedAt).not.toBeNull();
  });

  it("runs a scheduled job once per Manila day, however often it is asked", async () => {
    await runJob(db, "daily", "SCHEDULED", ok, T);
    expect(await runJob(db, "daily", "SCHEDULED", ok, manila("2026-10-05T20:00:00"))).toEqual({ ran: false, reason: "ALREADY_RAN_TODAY" });
    expect(runs()).toHaveLength(1);
    expect((await runJob(db, "daily", "SCHEDULED", ok, manila("2026-10-06T08:00:00"))).ran).toBe(true);
  });

  it("records a failure with its error and lets a later tick try again the same day", async () => {
    const res = await runJob(db, "daily", "SCHEDULED", async () => { throw new Error("disk full"); }, T);
    expect(res).toEqual({ ran: true, error: "disk full" });
    expect(runs()[0]).toMatchObject({ status: "FAILED", error: "disk full" });
    // Not every minute all day: wait before trying again, so a persistent failure can't flood job_run.
    expect(await runJob(db, "daily", "SCHEDULED", ok, new Date(T.getTime() + FAILED_RETRY_MS - 1000))).toEqual({ ran: false, reason: "RECENTLY_FAILED" });
    expect((await runJob(db, "daily", "SCHEDULED", ok, new Date(T.getTime() + FAILED_RETRY_MS + 1000))).ran).toBe(true);
    expect(runs()).toHaveLength(2);
  });

  it("does not start a second copy while one is running, but recovers from a crashed one", async () => {
    db.insert(s.jobRuns).values({ job: "daily", trigger: "SCHEDULED", status: "RUNNING", startedAt: T }).run();
    expect(await runJob(db, "daily", "SCHEDULED", ok, new Date(T.getTime() + 60_000))).toEqual({ ran: false, reason: "ALREADY_RUNNING" });
    expect(await runJob(db, "daily", "MANUAL", ok, new Date(T.getTime() + 60_000))).toEqual({ ran: false, reason: "ALREADY_RUNNING" });
    const later = new Date(T.getTime() + STALE_RUN_MS + 1000);
    expect((await runJob(db, "daily", "SCHEDULED", ok, later)).ran).toBe(true);
  });

  it("lets an admin run it by hand even after the scheduled run succeeded", async () => {
    await runJob(db, "daily", "SCHEDULED", ok, T);
    const res = await runJob(db, "daily", "MANUAL", ok, manila("2026-10-05T15:00:00"));
    expect(res.ran).toBe(true);
    expect(runs().map((r) => r.trigger).sort()).toEqual(["MANUAL", "SCHEDULED"]);
  });

  it("truncates a very long error", async () => {
    await runJob(db, "daily", "SCHEDULED", async () => { throw new Error("x".repeat(5000)); }, T);
    expect(runs()[0].error!.length).toBeLessThanOrEqual(500);
  });
});

describe("reconcile: housekeeping", () => {
  it("prunes old finished job runs and email rows, and reports it", () => {
    const old = manila("2026-05-01T08:00:00");
    db.insert(s.jobRuns).values({ job: "daily-reconcile", trigger: "SCHEDULED", status: "SUCCEEDED", startedAt: old }).run();
    db.insert(s.emailLogs).values({ type: "TEST", toEmail: "x@example.com", subject: "t", dedupeKey: "old", status: "SENT", createdAt: old }).run();
    const summary = reconcile(db, manila("2026-10-19T08:00:00"));
    expect(summary).toMatchObject({ prunedEmails: 1, prunedJobRuns: 1 });
    expect(db.select().from(s.jobRuns).all()).toHaveLength(0);
  });
});

describe("reconcile through runJob (end to end)", () => {
  it("a day's run issues statements once and a second tick that day does nothing", async () => {
    const T = manila("2026-10-01T08:00:00");
    const first = await runJob(db, "daily-reconcile", "SCHEDULED", async () => reconcile(db, T), T);
    expect(first).toMatchObject({ ran: true, summary: { created: 2 } });
    const second = await runJob(db, "daily-reconcile", "SCHEDULED", async () => reconcile(db, T), manila("2026-10-01T08:01:00"));
    expect(second).toEqual({ ran: false, reason: "ALREADY_RAN_TODAY" });
    expect(statements()).toHaveLength(2);
  });
});
