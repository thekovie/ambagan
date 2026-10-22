import { beforeEach, describe, expect, it } from "vitest";
import { getMemberDashboard } from "@/server/billing/dashboard";
import { dueDateOf, issueDateOf } from "@/server/billing/dates";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { createTestDb } from "./helpers/db";

let db: Db;
let ana: typeof s.users.$inferSelect;
let spotify: typeof s.subscriptions.$inferSelect;
const NOW = new Date("2026-10-05T04:00:00Z"); // Oct 5, Manila: after the 1st, before the 10th

function addStatement(period: string, status: typeof s.statements.$inferInsert["status"], over: Partial<typeof s.statements.$inferInsert> = {}) {
  return db
    .insert(s.statements)
    .values({
      reference: `SPOT-${period.replace("-", "")}-AAAAAA`,
      userId: ana.id,
      subscriptionId: spotify.id,
      period,
      subscriptionName: "Spotify",
      amountMinor: 5000,
      outstandingMinor: status === "PAID" || status === "CANCELLED" ? 0 : 5000,
      currency: "PHP",
      issuedAt: issueDateOf(period, 1),
      dueAt: dueDateOf(period, 10),
      status,
      ...over,
    })
    .returning()
    .get();
}

beforeEach(() => {
  db = createTestDb();
  ana = db.insert(s.users).values({ email: "ana@example.com", name: "Ana" }).returning().get();
  spotify = db.insert(s.subscriptions).values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 5000 }).returning().get();
  db.insert(s.memberships).values({ userId: ana.id, subscriptionId: spotify.id, startPeriod: "2026-08" }).run();
});

describe("getMemberDashboard: which statement leads", () => {
  it("has nothing to show before the first statement", () => {
    const data = getMemberDashboard(db, ana.id, NOW);
    expect(data.primary).toBeNull();
    expect(data.attention).toEqual([]);
    expect(data.recent).toEqual([]);
  });

  it("leads with the oldest statement that needs payment; the rest are listed as needing attention", () => {
    addStatement("2026-08", "PAID");
    const sept = addStatement("2026-09", "OVERDUE");
    const oct = addStatement("2026-10", "UNPAID");
    const data = getMemberDashboard(db, ana.id, NOW);
    expect(data.primary?.id).toBe(sept.id);
    expect(data.attention.map((r) => r.id)).toEqual([oct.id]);
    expect(data.recent.map((r) => r.period)).toEqual(["2026-08"]);
  });

  it("treats an unpaid statement past its due day as needing payment even before the job marks it overdue", () => {
    const sept = addStatement("2026-09", "UNPAID"); // due Sep 10: long past on Oct 5
    const data = getMemberDashboard(db, ana.id, NOW);
    expect(data.primary?.id).toBe(sept.id);
  });

  it("puts statements that need payment before ones already under verification", () => {
    addStatement("2026-09", "UNDER_VERIFICATION");
    const oct = addStatement("2026-10", "UNPAID");
    const data = getMemberDashboard(db, ana.id, NOW);
    expect(data.primary?.id).toBe(oct.id);
    expect(data.attention.map((r) => r.period)).toEqual(["2026-09"]);
  });

  it("when everything is settled, leads with the latest non-cancelled statement and keeps cancelled ones in history", () => {
    addStatement("2026-08", "CANCELLED");
    addStatement("2026-09", "PAID");
    const oct = addStatement("2026-10", "PAID");
    const data = getMemberDashboard(db, ana.id, NOW);
    expect(data.primary?.id).toBe(oct.id);
    expect(data.attention).toEqual([]);
    expect(data.recent.map((r) => [r.period, r.status])).toEqual([
      ["2026-09", "PAID"],
      ["2026-08", "CANCELLED"],
    ]);
  });

  it("shows at most four earlier statements", () => {
    for (const p of ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]) addStatement(p, "PAID");
    addStatement("2026-10", "UNPAID");
    expect(getMemberDashboard(db, ana.id, NOW).recent).toHaveLength(4);
  });

  it("never includes another member's statements", () => {
    const ben = db.insert(s.users).values({ email: "ben@example.com" }).returning().get();
    db.insert(s.statements)
      .values({
        reference: "SPOT-202610-BBBBBB",
        userId: ben.id,
        subscriptionId: spotify.id,
        period: "2026-10",
        subscriptionName: "Spotify",
        amountMinor: 5000,
        outstandingMinor: 5000,
        currency: "PHP",
        issuedAt: issueDateOf("2026-10", 1),
        dueAt: dueDateOf("2026-10", 10),
      })
      .run();
    expect(getMemberDashboard(db, ana.id, NOW).primary).toBeNull();
  });
});

describe("getMemberDashboard: next statement", () => {
  it("is next month once this month's issue day has passed", () => {
    addStatement("2026-10", "UNPAID");
    const [next] = getMemberDashboard(db, ana.id, NOW).upcoming;
    expect(next).toMatchObject({ planName: "Spotify", period: "2026-11", feeMinor: 5000, currency: "PHP" });
    expect(next.issueOn.toISOString()).toBe("2026-10-31T16:00:00.000Z"); // Nov 1, 00:00 Manila
  });

  it("is this month while the issue day is still ahead", () => {
    const beforeIssue = new Date("2026-09-30T04:00:00Z"); // Sep 30 Manila
    const [next] = getMemberDashboard(db, ana.id, beforeIssue).upcoming;
    expect(next.period).toBe("2026-10");
  });

  it("waits for a membership that starts in the future", () => {
    db.update(s.memberships).set({ startPeriod: "2026-12" }).run();
    expect(getMemberDashboard(db, ana.id, NOW).upcoming[0].period).toBe("2026-12");
  });

  it("skips paused memberships, inactive plans and plans with a statement already issued for that month", () => {
    db.update(s.memberships).set({ isActive: false }).run();
    expect(getMemberDashboard(db, ana.id, NOW).upcoming).toEqual([]);

    db.update(s.memberships).set({ isActive: true }).run();
    db.update(s.subscriptions).set({ isActive: false }).run();
    expect(getMemberDashboard(db, ana.id, NOW).upcoming).toEqual([]);

    db.update(s.subscriptions).set({ isActive: true }).run();
    addStatement("2026-11", "UNPAID"); // issued early by an admin
    expect(getMemberDashboard(db, ana.id, NOW).upcoming[0].period).toBe("2026-12");
  });
});

describe("getMemberDashboard: activity", () => {
  it("lists statements issued and payment events, newest first, capped", () => {
    const oct = addStatement("2026-10", "PAID");
    const method = db.insert(s.paymentMethods).values({ kind: "GCASH", label: "GCash" }).returning().get();
    db.insert(s.payments)
      .values({
        statementId: oct.id,
        userId: ana.id,
        destinationMethodId: method.id,
        sendingApp: "Maya",
        amountMinor: 5000,
        transactionRef: "REF1",
        transactionRefNorm: "REF1",
        transactionDate: new Date("2026-10-04T10:00:00Z"),
        status: "APPROVED",
        submittedAt: new Date("2026-10-04T10:05:00Z"),
        reviewedAt: new Date("2026-10-04T12:00:00Z"),
      })
      .run();

    const { activity } = getMemberDashboard(db, ana.id, NOW);
    expect(activity.map((a) => a.kind)).toEqual(["payment_approved", "payment_submitted", "statement_issued"]);
    expect(activity[0].label).toBe("Payment approved for October 2026");
    expect(getMemberDashboard(db, ana.id, NOW, { activityLimit: 2 }).activity).toHaveLength(2);
  });

  it("reports declined payments", () => {
    const oct = addStatement("2026-10", "UNPAID");
    const method = db.insert(s.paymentMethods).values({ kind: "MAYA", label: "Maya" }).returning().get();
    db.insert(s.payments)
      .values({
        statementId: oct.id,
        userId: ana.id,
        destinationMethodId: method.id,
        sendingApp: "GCash",
        amountMinor: 5000,
        transactionRef: "REF2",
        transactionRefNorm: "REF2",
        transactionDate: new Date("2026-10-04T10:00:00Z"),
        status: "DECLINED",
        declineReason: "Amount did not arrive",
        submittedAt: new Date("2026-10-04T10:05:00Z"),
        reviewedAt: new Date("2026-10-04T12:00:00Z"),
      })
      .run();
    expect(getMemberDashboard(db, ana.id, NOW).activity[0]).toMatchObject({ kind: "payment_declined", label: "Payment declined for October 2026" });
  });
});

describe("getMemberDashboard: what you owe in all", () => {
  it("adds up everything that still needs paying, and leaves out what is under verification, paid or cancelled", () => {
    addStatement("2026-08", "PAID");
    addStatement("2026-09", "OVERDUE", { outstandingMinor: 4000 });
    addStatement("2026-10", "UNPAID", { outstandingMinor: 5000 });
    addStatement("2026-11", "UNDER_VERIFICATION");
    const data = getMemberDashboard(db, ana.id, NOW);
    expect(data.owing).toEqual({ count: 2, totalMinor: 9000, currency: "PHP" });
  });

  it("is null when nothing needs paying", () => {
    addStatement("2026-10", "PAID");
    expect(getMemberDashboard(db, ana.id, NOW).owing).toBeNull();
  });
});

