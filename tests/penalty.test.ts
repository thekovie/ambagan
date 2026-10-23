import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { copyFor } from "@/server/email/notification-copy";
import { describePenalty } from "@/lib/penalty";
import { generateStatements } from "@/server/billing/generate";
import { accruePenalties, buildingPenaltyFor, lateDaysOf, listPendingPenalties, penaltyFor, removeLateFee, waivePenalty } from "@/server/billing/penalty";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { createTestDb } from "./helpers/db";

const at = (iso: string) => new Date(`${iso}+08:00`);
const rule = { amountMinor: 1000, everyDays: 2, capMinor: 5000 };

describe("penaltyFor", () => {
  it("charges once for every full interval late, so 'every 2 days' starts on day 2", () => {
    const every2 = { amountMinor: 1000, everyDays: 2, capMinor: null };
    expect([0, 1, 2, 3, 4, 9].map((d) => penaltyFor(d, every2))).toEqual([0, 0, 1000, 1000, 2000, 4000]);
  });

  it("charges every day when the interval is 1", () => {
    expect(penaltyFor(3, { amountMinor: 500, everyDays: 1, capMinor: null })).toBe(1500);
  });

  it("never goes past the cap, and an amount of zero means no penalty", () => {
    expect(penaltyFor(40, rule)).toBe(5000);
    expect(penaltyFor(40, { ...rule, amountMinor: 0 })).toBe(0);
  });
});

describe("lateDaysOf", () => {
  const dueAt = at("2026-10-10T23:59:59.999");
  const base = { dueAt, status: "OVERDUE" as const, payments: [] };

  it("counts whole Manila days after the due day, and none on the due day itself", () => {
    expect(lateDaysOf({ ...base, now: at("2026-10-10T23:00:00") })).toBe(0);
    expect(lateDaysOf({ ...base, now: at("2026-10-11T00:30:00") })).toBe(1);
    expect(lateDaysOf({ ...base, now: at("2026-10-20T12:00:00") })).toBe(10);
  });

  it("stops counting the day the member reported paying", () => {
    const payments = [{ status: "PENDING" as const, submittedAt: at("2026-10-14T09:00:00"), reviewedAt: null }];
    expect(lateDaysOf({ ...base, status: "UNDER_VERIFICATION", payments, now: at("2026-10-30T09:00:00") })).toBe(4);
  });

  it("does not count a report made on time, even if the admin took a week to approve it", () => {
    const payments = [{ status: "APPROVED" as const, submittedAt: at("2026-10-09T09:00:00"), reviewedAt: at("2026-10-17T09:00:00") }];
    expect(lateDaysOf({ ...base, status: "PAID", payments, now: at("2026-10-30T09:00:00") })).toBe(0);
  });

  it("resumes after a declined report, without counting the days it waited for the admin", () => {
    const payments = [{ status: "DECLINED" as const, submittedAt: at("2026-10-12T09:00:00"), reviewedAt: at("2026-10-15T09:00:00") }];
    // due 10th, now 20th: 10 days late, minus the 3 days (12th to 15th) the report was waiting.
    expect(lateDaysOf({ ...base, payments, now: at("2026-10-20T09:00:00") })).toBe(7);
  });

  it("is zero for a cancelled statement and for one marked paid with no report to date it by", () => {
    expect(lateDaysOf({ ...base, status: "CANCELLED", now: at("2026-10-30T09:00:00") })).toBe(0);
    expect(lateDaysOf({ ...base, status: "PAID", now: at("2026-10-30T09:00:00") })).toBe(0);
  });
});

let db: Db;
let admin: typeof s.users.$inferSelect;
let ana: typeof s.users.$inferSelect;
let plan: typeof s.subscriptions.$inferSelect;
let method: typeof s.paymentMethods.$inferSelect;

const statementOf = (period: string) => db.select().from(s.statements).where(and(eq(s.statements.userId, ana.id), eq(s.statements.period, period))).get()!;
const generate = (period: string, now: string) => generateStatements(db, { period, now: at(now), actorId: null });

beforeEach(() => {
  db = createTestDb();
  admin = db.insert(s.users).values({ email: "boss@example.com", role: "ADMIN" }).returning().get();
  ana = db.insert(s.users).values({ email: "ana@example.com", name: "Ana" }).returning().get();
  // ₱50 a month, due the 10th; ₱10 for every 2 days late, at most ₱50; switched on before October.
  plan = db
    .insert(s.subscriptions)
    .values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 5000, dueDay: 10, penaltyMinor: 1000, penaltyEveryDays: 2, penaltyCapMinor: 5000, penaltySince: at("2026-09-15T00:00:00") })
    .returning()
    .get();
  db.insert(s.memberships).values({ userId: ana.id, subscriptionId: plan.id, startPeriod: "2026-10" }).run();
  method = db.insert(s.paymentMethods).values({ kind: "GCASH", label: "GCash", isActive: true }).returning().get();
  generate("2026-10", "2026-10-01T08:00:00");
});

describe("carrying penalties onto the next monthly statement", () => {
  it("adds what a late statement collected to the next one, shown separately from the fee", () => {
    // Unpaid since the 10th; on 15 Oct that is 5 days late: two charges of ₱10.
    expect(accruePenalties(db, at("2026-10-15T08:00:00"))).toBe(1);
    expect(buildingPenaltyFor(db, statementOf("2026-10").id)).toBe(2000);

    generate("2026-11", "2026-10-15T09:00:00"); // (a back-dated run, only to show the carry)
    const next = statementOf("2026-11");
    expect([next.amountMinor, next.penaltyMinor, next.outstandingMinor]).toEqual([7000, 2000, 7000]);
    const row = db.select().from(s.penalties).get()!;
    expect(row).toMatchObject({ statementId: statementOf("2026-10").id, appliedToStatementId: next.id, amountMinor: 2000 });
  });

  it("freezes the penalty at the day the next statement is issued, and caps it", () => {
    generate("2026-11", "2026-11-01T08:00:00"); // 22 days late: 11 charges = ₱110, capped at ₱50
    const next = statementOf("2026-11");
    expect(next.penaltyMinor).toBe(5000);
    expect(next.amountMinor).toBe(10000);
    // Paying the old statement later, or running the job again, changes nothing on the new one.
    accruePenalties(db, at("2026-11-20T08:00:00"));
    expect(statementOf("2026-11").penaltyMinor).toBe(5000);
    const october = db.select().from(s.penalties).where(eq(s.penalties.statementId, statementOf("2026-10").id)).get()!;
    expect(october).toMatchObject({ amountMinor: 5000, appliedToStatementId: next.id });
    // (November's own statement is late by then, so it has started a penalty of its own, for December.)
    expect(buildingPenaltyFor(db, next.id)).toBe(5000);
  });

  it("generating the same month again does not carry anything twice", () => {
    generate("2026-11", "2026-11-01T08:00:00");
    expect(generate("2026-11", "2026-11-02T08:00:00")).toEqual({ created: 0, existing: 1 });
    expect(statementOf("2026-11").penaltyMinor).toBe(5000);
  });

  it("does not penalise a member who reported paying on time", () => {
    const oct = statementOf("2026-10");
    db.insert(s.payments)
      .values({ statementId: oct.id, userId: ana.id, destinationMethodId: method.id, sendingApp: "Maya", amountMinor: 5000, transactionRef: "R1", transactionRefNorm: "R1", transactionDate: at("2026-10-09T10:00:00"), status: "APPROVED", submittedAt: at("2026-10-09T10:00:00"), reviewedAt: at("2026-10-20T10:00:00") })
      .run();
    db.update(s.statements).set({ status: "PAID", outstandingMinor: 0 }).where(eq(s.statements.id, oct.id)).run();
    generate("2026-11", "2026-11-01T08:00:00");
    expect(statementOf("2026-11")).toMatchObject({ amountMinor: 5000, penaltyMinor: 0 });
  });

  it("never reaches back to statements that were due before the penalty was switched on", () => {
    db.update(s.subscriptions).set({ penaltySince: at("2026-10-12T00:00:00") }).where(eq(s.subscriptions.id, plan.id)).run();
    generate("2026-11", "2026-11-01T08:00:00");
    expect(statementOf("2026-11").penaltyMinor).toBe(0);
  });

  it("does nothing for a plan without a penalty", () => {
    db.update(s.subscriptions).set({ penaltyMinor: 0 }).where(eq(s.subscriptions.id, plan.id)).run();
    generate("2026-11", "2026-11-01T08:00:00");
    expect(statementOf("2026-11")).toMatchObject({ amountMinor: 5000, penaltyMinor: 0 });
    expect(db.select().from(s.penalties).all()).toEqual([]);
  });
});

describe("waiving", () => {
  it("a waived penalty no longer shows as pending and is not carried", () => {
    accruePenalties(db, at("2026-10-15T08:00:00"));
    const [pending] = listPendingPenalties(db);
    expect(pending).toMatchObject({ amountMinor: 2000, lateDays: 5, stillLate: true, memberName: "Ana" });

    expect(waivePenalty(db, { penaltyId: pending.id, actorId: admin.id })).toEqual({ ok: true });
    expect(listPendingPenalties(db)).toEqual([]);
    generate("2026-11", "2026-11-01T08:00:00");
    expect(statementOf("2026-11").penaltyMinor).toBe(0);
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "penalty.waived")).all()).toHaveLength(1);
  });

  it("can't waive one that already landed on a statement, but the late fee can be taken off an unpaid statement", () => {
    generate("2026-11", "2026-11-01T08:00:00");
    const penalty = db.select().from(s.penalties).get()!;
    expect(waivePenalty(db, { penaltyId: penalty.id, actorId: admin.id })).toEqual({ ok: false, error: "ALREADY_ON_STATEMENT" });

    const nov = statementOf("2026-11");
    expect(removeLateFee(db, { statementId: nov.id, actorId: admin.id })).toEqual({ ok: true });
    expect(statementOf("2026-11")).toMatchObject({ amountMinor: 5000, penaltyMinor: 0, outstandingMinor: 5000 });
    expect(db.select().from(s.penalties).get()!.waivedAt).not.toBeNull();
    expect(removeLateFee(db, { statementId: nov.id, actorId: admin.id })).toEqual({ ok: false, error: "NO_LATE_FEE" });
  });

  it("won't change the amount of a statement whose payment is already being checked", () => {
    generate("2026-11", "2026-11-01T08:00:00");
    const nov = statementOf("2026-11");
    db.update(s.statements).set({ status: "UNDER_VERIFICATION" }).where(eq(s.statements.id, nov.id)).run();
    expect(removeLateFee(db, { statementId: nov.id, actorId: admin.id })).toEqual({ ok: false, error: "NOT_EDITABLE" });
  });
});

describe("how penalties are worded", () => {
  it("describes the rule in plain words", () => {
    expect(describePenalty({ amountMinor: 1000, everyDays: 2, capMinor: 5000 })).toBe("₱10.00 every 2 days late, up to ₱50.00");
    expect(describePenalty({ amountMinor: 500, everyDays: 1, capMinor: null })).toBe("₱5.00 every day late");
    expect(describePenalty({ amountMinor: 500, everyDays: 7, capMinor: null })).toBe("₱5.00 every week late");
    expect(describePenalty({ amountMinor: 0, everyDays: 1, capMinor: null })).toBeNull();
  });

  it("names carried late fees in the statement email so the total is explained", () => {
    const facts = copyFor("SOA_GENERATED", { name: "Ana", subscription: "Spotify", period: "November 2026", amount: "₱70.00", penalty: "₱20.00", dueDate: "Nov 10, 2026" }).facts;
    expect(facts).toContainEqual(["Late fees (earlier months)", "₱20.00"]);
    const plain = copyFor("SOA_GENERATED", { name: "Ana", subscription: "Spotify", period: "November 2026", amount: "₱50.00", dueDate: "Nov 10, 2026" }).facts;
    expect(plain.map(([label]) => label)).not.toContain("Late fees (earlier months)");
  });
});
