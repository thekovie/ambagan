import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { generateStatements } from "@/server/billing/generate";
import { generateReference, REFERENCE_ALPHABET } from "@/server/billing/reference";
import {
  cancelStatement,
  getStatementForUser,
  listStatements,
  listStatementsForUser,
  markOverdue,
} from "@/server/billing/statements";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { createTestDb } from "./helpers/db";

let db: Db;
let admin: typeof s.users.$inferSelect;
let spotify: typeof s.subscriptions.$inferSelect;
const OCT = "2026-10";
const OCT_1 = new Date("2026-09-30T16:05:00Z"); // Oct 1, 00:05 Manila

function addMember(email: string, opts: { startPeriod?: string; active?: boolean; membershipActive?: boolean } = {}) {
  const user = db.insert(s.users).values({ email, name: email.split("@")[0], isActive: opts.active ?? true }).returning().get();
  db.insert(s.memberships)
    .values({ userId: user.id, subscriptionId: spotify.id, startPeriod: opts.startPeriod ?? "2026-09", isActive: opts.membershipActive ?? true })
    .run();
  return user;
}

beforeEach(() => {
  db = createTestDb();
  admin = db.insert(s.users).values({ email: "boss@example.com", role: "ADMIN" }).returning().get();
  spotify = db.insert(s.subscriptions).values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 5000 }).returning().get();
});

describe("generateReference", () => {
  it("looks like SPOT-YYYYMM-XXXXXX with an unambiguous alphabet", () => {
    const ref = generateReference("SPOT", "2026-10");
    expect(ref).toMatch(/^SPOT-202610-[A-Z0-9]{6}$/);
    for (const ch of ref.slice(-6)) expect(REFERENCE_ALPHABET).toContain(ch);
    expect(REFERENCE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("does not repeat across a batch of draws", () => {
    // 31^6 (about 887 million) suffixes: by chance, 2000 draws collide about 1 run in 500 (and the database, with a
    // retry, handles a real collision), so this stays small enough not to flake while still catching a generator that
    // repeats or returns a constant.
    const seen = new Set(Array.from({ length: 100 }, () => generateReference("SPOT", "2026-10")));
    expect(seen.size).toBe(100);
  });
});

describe("generateStatements", () => {
  it("creates one UNPAID statement per active member with a snapshot of the plan", () => {
    const ana = addMember("ana@example.com");
    addMember("ben@example.com");
    const res = generateStatements(db, { period: OCT, now: OCT_1, actorId: admin.id });
    expect(res).toMatchObject({ created: 2, existing: 0 });

    const st = db.select().from(s.statements).where(eq(s.statements.userId, ana.id)).get()!;
    expect(st).toMatchObject({
      period: OCT,
      subscriptionId: spotify.id,
      subscriptionName: "Spotify",
      amountMinor: 5000,
      outstandingMinor: 5000,
      currency: "PHP",
      status: "UNPAID",
    });
    expect(st.reference).toMatch(/^SPOT-202610-[A-Z0-9]{6}$/);
    expect(st.issuedAt).toEqual(OCT_1);
    expect(st.dueAt.toISOString()).toBe("2026-10-10T15:59:59.999Z");
  });

  it("is idempotent: running again creates nothing and changes nothing", () => {
    addMember("ana@example.com");
    addMember("ben@example.com");
    generateStatements(db, { period: OCT, now: OCT_1, actorId: admin.id });
    const before = db.select().from(s.statements).all();
    const again = generateStatements(db, { period: OCT, now: new Date(OCT_1.getTime() + 3600_000), actorId: admin.id });
    expect(again).toMatchObject({ created: 0, existing: 2 });
    expect(db.select().from(s.statements).all()).toEqual(before);
  });

  it("only bills active members of active plans from their start period", () => {
    addMember("ana@example.com");
    addMember("future@example.com", { startPeriod: "2026-11" });
    addMember("gone@example.com", { active: false });
    addMember("paused@example.com", { membershipActive: false });
    const res = generateStatements(db, { period: OCT, now: OCT_1, actorId: admin.id });
    expect(res.created).toBe(1);

    db.update(s.subscriptions).set({ isActive: false }).where(eq(s.subscriptions.id, spotify.id)).run();
    expect(generateStatements(db, { period: "2026-11", now: OCT_1, actorId: admin.id }).created).toBe(0);
  });

  it("a later fee change never rewrites issued statements, and applies to the next cycle", () => {
    addMember("ana@example.com");
    generateStatements(db, { period: OCT, now: OCT_1, actorId: admin.id });
    db.update(s.subscriptions).set({ feeMinor: 7500, name: "Spotify Family" }).where(eq(s.subscriptions.id, spotify.id)).run();
    generateStatements(db, { period: OCT, now: OCT_1, actorId: admin.id });
    generateStatements(db, { period: "2026-11", now: OCT_1, actorId: admin.id });
    const rows = db.select().from(s.statements).orderBy(s.statements.period).all();
    expect(rows.map((r) => [r.period, r.amountMinor, r.subscriptionName])).toEqual([
      ["2026-10", 5000, "Spotify"],
      ["2026-11", 7500, "Spotify Family"],
    ]);
  });

  it("never touches earlier statements when a new period is generated", () => {
    addMember("ana@example.com");
    generateStatements(db, { period: "2026-09", now: new Date("2026-08-31T16:05:00Z"), actorId: admin.id });
    const sept = db.select().from(s.statements).get()!;
    db.update(s.statements).set({ status: "PAID", outstandingMinor: 0 }).where(eq(s.statements.id, sept.id)).run();
    generateStatements(db, { period: OCT, now: OCT_1, actorId: admin.id });
    expect(db.select().from(s.statements).where(eq(s.statements.id, sept.id)).get()).toMatchObject({ status: "PAID", outstandingMinor: 0 });
  });

  it("retries when a generated reference collides", () => {
    addMember("ana@example.com");
    addMember("ben@example.com");
    const suffixes = ["AAAAAA", "AAAAAA", "BBBBBB"]; // second member's first draw collides
    const res = generateStatements(db, { period: OCT, now: OCT_1, actorId: admin.id, suffix: () => suffixes.shift()! });
    expect(res.created).toBe(2);
    expect(db.select().from(s.statements).all().map((r) => r.reference).sort()).toEqual(["SPOT-202610-AAAAAA", "SPOT-202610-BBBBBB"]);
  });

  it("can be limited to one plan and records an audit entry", () => {
    addMember("ana@example.com");
    const other = db.insert(s.subscriptions).values({ name: "Netflix", refPrefix: "NFLX", feeMinor: 19900 }).returning().get();
    const user = db.select().from(s.users).where(eq(s.users.email, "ana@example.com")).get()!;
    db.insert(s.memberships).values({ userId: user.id, subscriptionId: other.id, startPeriod: "2026-09" }).run();
    const res = generateStatements(db, { period: OCT, now: OCT_1, actorId: admin.id, subscriptionId: other.id });
    expect(res.created).toBe(1);
    expect(db.select().from(s.statements).get()?.subscriptionName).toBe("Netflix");
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "statements.generated")).all()).toHaveLength(1);
  });
});

describe("markOverdue", () => {
  function statementDueAt(due: Date, status: "UNPAID" | "UNDER_VERIFICATION" | "PAID" | "OVERDUE" | "CANCELLED", n: number) {
    const user = addMember(`m${n}@example.com`);
    return db
      .insert(s.statements)
      .values({
        reference: `SPOT-202610-AAAA0${n}`,
        userId: user.id,
        subscriptionId: spotify.id,
        period: OCT,
        subscriptionName: "Spotify",
        amountMinor: 5000,
        outstandingMinor: status === "PAID" ? 0 : 5000,
        currency: "PHP",
        issuedAt: OCT_1,
        dueAt: due,
        status,
      })
      .returning()
      .get();
  }

  it("flips only unpaid statements that are past their due moment", () => {
    const past = new Date("2026-10-10T15:59:59.999Z");
    const unpaidPast = statementDueAt(past, "UNPAID", 1);
    const verifying = statementDueAt(past, "UNDER_VERIFICATION", 2);
    const paid = statementDueAt(past, "PAID", 3);
    const cancelled = statementDueAt(past, "CANCELLED", 4);
    const unpaidFuture = statementDueAt(new Date("2026-11-10T15:59:59.999Z"), "UNPAID", 5);

    const changed = markOverdue(db, new Date("2026-10-10T16:00:00Z"));
    expect(changed).toBe(1);
    const status = (id: string) => db.select().from(s.statements).where(eq(s.statements.id, id)).get()?.status;
    expect(status(unpaidPast.id)).toBe("OVERDUE");
    expect(status(verifying.id)).toBe("UNDER_VERIFICATION");
    expect(status(paid.id)).toBe("PAID");
    expect(status(cancelled.id)).toBe("CANCELLED");
    expect(status(unpaidFuture.id)).toBe("UNPAID");
  });

  it("is not overdue until the due day has fully ended in Manila", () => {
    const due = new Date("2026-10-10T15:59:59.999Z"); // end of Oct 10, Manila
    const st = statementDueAt(due, "UNPAID", 1);
    expect(markOverdue(db, new Date("2026-10-10T15:00:00Z"))).toBe(0); // Oct 10, 23:00 Manila
    expect(db.select().from(s.statements).where(eq(s.statements.id, st.id)).get()?.status).toBe("UNPAID");
  });
});

describe("cancelStatement", () => {
  function make(status: typeof s.statements.$inferInsert["status"]) {
    const user = addMember("ana@example.com");
    generateStatements(db, { period: OCT, now: OCT_1, actorId: admin.id });
    const st = db.select().from(s.statements).where(eq(s.statements.userId, user.id)).get()!;
    if (status && status !== "UNPAID") db.update(s.statements).set({ status }).where(eq(s.statements.id, st.id)).run();
    return st;
  }

  it("cancels an unpaid statement with a reason, zeroes the balance and writes an audit entry", () => {
    const st = make("UNPAID");
    const res = cancelStatement(db, { statementId: st.id, actorId: admin.id, reason: "Left the group", now: OCT_1 });
    expect(res).toEqual({ ok: true });
    expect(db.select().from(s.statements).where(eq(s.statements.id, st.id)).get()).toMatchObject({
      status: "CANCELLED",
      outstandingMinor: 0,
      amountMinor: 5000,
      cancelReason: "Left the group",
      cancelledAt: OCT_1,
    });
    const log = db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "statement.cancelled")).get()!;
    expect(log).toMatchObject({ actorId: admin.id, entityType: "statement", entityId: st.id });
    expect(JSON.parse(log.metadata)).toMatchObject({ reason: "Left the group", previousStatus: "UNPAID" });
  });

  it("requires a meaningful reason", () => {
    const st = make("UNPAID");
    expect(cancelStatement(db, { statementId: st.id, actorId: admin.id, reason: "  " })).toEqual({ ok: false, error: "REASON_REQUIRED" });
    expect(db.select().from(s.statements).where(eq(s.statements.id, st.id)).get()?.status).toBe("UNPAID");
  });

  it.each(["PAID", "UNDER_VERIFICATION", "CANCELLED"] as const)("refuses to cancel a %s statement", (status) => {
    const st = make(status);
    expect(cancelStatement(db, { statementId: st.id, actorId: admin.id, reason: "x reason" })).toEqual({
      ok: false,
      error: "NOT_CANCELLABLE",
    });
  });

  it("allows cancelling an overdue statement and reports unknown ids", () => {
    const st = make("OVERDUE");
    expect(cancelStatement(db, { statementId: st.id, actorId: admin.id, reason: "Waived" }).ok).toBe(true);
    expect(cancelStatement(db, { statementId: "nope", actorId: admin.id, reason: "Waived" })).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("rejects an over-long reason server-side (the input's maxLength is only a hint)", () => {
    const st = make("UNPAID");
    const res = cancelStatement(db, { statementId: st.id, actorId: admin.id, reason: "x".repeat(201) });
    expect(res).toEqual({ ok: false, error: "REASON_TOO_LONG" });
    expect(db.select().from(s.statements).where(eq(s.statements.id, st.id)).get()?.status).toBe("UNPAID");
  });

  it("keeps the cycle slot: a cancelled statement is never regenerated", () => {
    const st = make("UNPAID");
    cancelStatement(db, { statementId: st.id, actorId: admin.id, reason: "Left the group" });
    const res = generateStatements(db, { period: OCT, now: OCT_1, actorId: admin.id });
    expect(res.created).toBe(0);
    expect(db.select().from(s.statements).all()).toHaveLength(1);
  });
});

describe("statement queries", () => {
  it("a member can only read their own statements", () => {
    const ana = addMember("ana@example.com");
    const ben = addMember("ben@example.com");
    generateStatements(db, { period: OCT, now: OCT_1, actorId: admin.id });
    const anas = db.select().from(s.statements).where(eq(s.statements.userId, ana.id)).get()!;
    expect(getStatementForUser(db, ana.id, anas.id)?.id).toBe(anas.id);
    expect(getStatementForUser(db, ben.id, anas.id)).toBeNull();
    expect(getStatementForUser(db, ana.id, "nope")).toBeNull();
  });

  it("lists a member's statements newest period first, including cancelled ones", () => {
    const ana = addMember("ana@example.com");
    generateStatements(db, { period: "2026-09", now: OCT_1, actorId: admin.id });
    generateStatements(db, { period: OCT, now: OCT_1, actorId: admin.id });
    const sept = db.select().from(s.statements).where(eq(s.statements.period, "2026-09")).get()!;
    cancelStatement(db, { statementId: sept.id, actorId: admin.id, reason: "Waived" });
    const rows = listStatementsForUser(db, ana.id);
    expect(rows.map((r) => [r.period, r.status])).toEqual([
      [OCT, "UNPAID"],
      ["2026-09", "CANCELLED"],
    ]);
  });

  it("status filters agree with what the UI shows: unpaid past its due day counts as overdue", () => {
    addMember("ana@example.com");
    addMember("ben@example.com");
    addMember("cy@example.com");
    generateStatements(db, { period: OCT, now: OCT_1, actorId: admin.id });
    const [first, second, third] = db.select().from(s.statements).orderBy(s.statements.reference).all();
    // first: persisted OVERDUE; second: UNPAID but past due (job hasn't run); third: UNPAID, not yet due.
    db.update(s.statements).set({ status: "OVERDUE" }).where(eq(s.statements.id, first.id)).run();
    db.update(s.statements).set({ dueAt: new Date("2026-10-09T15:59:59.999Z") }).where(eq(s.statements.id, second.id)).run();
    const now = new Date("2026-10-10T00:00:00Z");

    const ids = (status: "UNPAID" | "OVERDUE") => listStatements(db, { status, now }).map((r) => r.id).sort();
    expect(ids("OVERDUE")).toEqual([first.id, second.id].sort());
    expect(ids("UNPAID")).toEqual([third.id]);
  });

  it("limits how many rows the admin list returns", () => {
    for (let i = 0; i < 5; i++) addMember(`m${i}@example.com`);
    generateStatements(db, { period: OCT, now: OCT_1, actorId: admin.id });
    expect(listStatements(db, { limit: 3 })).toHaveLength(3);
  });

  it("admin list filters by period, status and member and includes the member's name", () => {
    const ana = addMember("ana@example.com");
    addMember("ben@example.com");
    generateStatements(db, { period: OCT, now: OCT_1, actorId: admin.id });
    generateStatements(db, { period: "2026-11", now: OCT_1, actorId: admin.id });
    expect(listStatements(db, {})).toHaveLength(4);
    expect(listStatements(db, { period: OCT })).toHaveLength(2);
    expect(listStatements(db, { period: OCT, userId: ana.id })[0]).toMatchObject({ memberName: "ana", memberEmail: "ana@example.com" });
    expect(listStatements(db, { status: "PAID" })).toHaveLength(0);
  });
});
