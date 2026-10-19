import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { dueDateOf, issueDateOf } from "@/server/billing/dates";
import { getAdminOverview } from "@/server/billing/overview";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { createTestDb } from "./helpers/db";

let db: Db;
let spotify: typeof s.subscriptions.$inferSelect;
let method: typeof s.paymentMethods.$inferSelect;
const NOW = new Date("2026-10-12T04:00:00Z"); // Oct 12 Manila: after the 10th

function addMember(email: string, name: string | null = email.split("@")[0], opts: { active?: boolean; membership?: boolean } = {}) {
  const user = db.insert(s.users).values({ email, name, isActive: opts.active ?? true }).returning().get();
  if (opts.membership !== false) {
    db.insert(s.memberships).values({ userId: user.id, subscriptionId: spotify.id, startPeriod: "2026-08" }).run();
  }
  return user;
}

let seq = 0;
function addStatement(userId: string, period: string, status: typeof s.statements.$inferInsert["status"], over: Partial<typeof s.statements.$inferInsert> = {}) {
  seq += 1;
  return db
    .insert(s.statements)
    .values({
      reference: `SPOT-${period.replace("-", "")}-A${String(seq).padStart(5, "0")}`,
      userId,
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

function addPayment(statementId: string, userId: string, status: "PENDING" | "APPROVED" | "DECLINED", amountMinor = 5000) {
  seq += 1;
  db.insert(s.payments)
    .values({
      statementId,
      userId,
      destinationMethodId: method.id,
      sendingApp: "GCash",
      amountMinor,
      transactionRef: `REF${seq}`,
      transactionRefNorm: `REF${seq}`,
      transactionDate: new Date("2026-10-05T00:00:00Z"),
      status,
    })
    .run();
}

beforeEach(() => {
  db = createTestDb();
  spotify = db.insert(s.subscriptions).values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 5000 }).returning().get();
  method = db.insert(s.paymentMethods).values({ kind: "GCASH", label: "GCash" }).returning().get();
});

describe("getAdminOverview", () => {
  it("is empty and calm before anything is issued", () => {
    addMember("ana@example.com");
    const o = getAdminOverview(db, NOW);
    expect(o).toMatchObject({
      period: "2026-10",
      activeMembers: 1,
      cycle: { count: 0, chargedMinor: 0, collectedMinor: 0, paidCount: 0 },
      outstandingMinor: 0,
      pendingVerification: 0,
      overdueCount: 0,
    });
    expect(o.tickets).toEqual([]);
  });

  it("charges and collections are for the current cycle only; cancelled statements are not charges", () => {
    const ana = addMember("ana@example.com");
    const ben = addMember("ben@example.com");
    const cy = addMember("cy@example.com");
    const anaOct = addStatement(ana.id, "2026-10", "PAID");
    addPayment(anaOct.id, ana.id, "APPROVED");
    addStatement(ben.id, "2026-10", "UNPAID");
    addStatement(cy.id, "2026-10", "CANCELLED");
    const anaSep = addStatement(ana.id, "2026-09", "PAID");
    addPayment(anaSep.id, ana.id, "APPROVED"); // last month's money is not this month's collection

    const { cycle } = getAdminOverview(db, NOW);
    expect(cycle).toEqual({ count: 2, chargedMinor: 10000, collectedMinor: 5000, paidCount: 1 });
  });

  it("only approved payments count as collected (pending and declined do not)", () => {
    const ana = addMember("ana@example.com");
    const ben = addMember("ben@example.com");
    const anaSt = addStatement(ana.id, "2026-10", "UNDER_VERIFICATION");
    addPayment(anaSt.id, ana.id, "PENDING");
    const benSt = addStatement(ben.id, "2026-10", "UNPAID");
    addPayment(benSt.id, ben.id, "DECLINED");
    const o = getAdminOverview(db, NOW);
    expect(o.cycle.collectedMinor).toBe(0);
    expect(o.pendingVerification).toBe(1);
  });

  it("outstanding balance spans every month and ignores paid and cancelled statements", () => {
    const ana = addMember("ana@example.com");
    addStatement(ana.id, "2026-08", "OVERDUE");
    addStatement(ana.id, "2026-09", "PAID");
    addStatement(ana.id, "2026-10", "UNPAID", { outstandingMinor: 2500 }); // partly settled by an adjustment
    expect(getAdminOverview(db, NOW).outstandingMinor).toBe(7500);
  });

  it("counts unpaid statements past their due day as overdue, matching what members see", () => {
    const ana = addMember("ana@example.com");
    const ben = addMember("ben@example.com");
    const cy = addMember("cy@example.com");
    addStatement(ana.id, "2026-10", "OVERDUE");
    addStatement(ben.id, "2026-10", "UNPAID"); // due Oct 10, now Oct 12: effectively overdue
    addStatement(cy.id, "2026-11", "UNPAID"); // not due yet
    expect(getAdminOverview(db, NOW).overdueCount).toBe(2);
  });

  it("lists one ticket per member for the cycle, with the displayed status, worst first", () => {
    const ana = addMember("ana@example.com", "Ana");
    const ben = addMember("ben@example.com", null);
    const cy = addMember("cy@example.com", "Cy");
    addStatement(ana.id, "2026-10", "PAID");
    addStatement(ben.id, "2026-10", "UNPAID"); // effectively overdue
    addStatement(cy.id, "2026-10", "UNDER_VERIFICATION");
    const { tickets } = getAdminOverview(db, NOW);
    expect(tickets.map((t) => [t.memberName, t.status])).toEqual([
      ["ben@example.com", "OVERDUE"], // name falls back to the email
      ["Cy", "UNDER_VERIFICATION"],
      ["Ana", "PAID"],
    ]);
  });

  it("counts only active members on active plans", () => {
    addMember("ana@example.com");
    addMember("gone@example.com", "Gone", { active: false });
    addMember("none@example.com", "None", { membership: false });
    const paused = addMember("paused@example.com");
    db.update(s.memberships).set({ isActive: false }).where(eq(s.memberships.userId, paused.id)).run();
    expect(getAdminOverview(db, NOW).activeMembers).toBe(1);
  });
});
