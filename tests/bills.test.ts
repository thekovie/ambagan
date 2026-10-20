import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { cancelBill, createBill, getBillDetail, getShareForStatement, listBills } from "@/server/bills";
import { endOfManilaDay } from "@/server/billing/dates";
import { getAdminOverview } from "@/server/billing/overview";
import { generateStatements } from "@/server/billing/generate";
import { getMemberDashboard } from "@/server/billing/dashboard";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { createSubscription, listSubscriptions, updateSubscription } from "@/server/subscriptions/service";
import { reconcile } from "@/server/jobs/reconcile";
import { createTestDb } from "./helpers/db";

let db: Db;
let admin: typeof s.users.$inferSelect;
let otherAdmin: typeof s.users.$inferSelect;
let ana: typeof s.users.$inferSelect;
let ben: typeof s.users.$inferSelect;
let cy: typeof s.users.$inferSelect;
let spotify: typeof s.subscriptions.$inferSelect;

const NOW = new Date("2026-10-05T04:00:00Z"); // Oct 5, Manila
const DUE_DATE = "2026-10-20";
const DUE = new Date("2026-10-20T15:59:59.999Z"); // the end of that day in Manila

const uuid = () => crypto.randomUUID();

beforeEach(() => {
  db = createTestDb();
  const add = (email: string, name: string, role: "ADMIN" | "MEMBER" = "MEMBER", over: Partial<typeof s.users.$inferInsert> = {}) =>
    db.insert(s.users).values({ email, name, role, ...over }).returning().get();
  admin = add("admin@example.com", "Admin", "ADMIN");
  otherAdmin = add("admin2@example.com", "Second Admin", "ADMIN");
  ana = add("ana@example.com", "Ana");
  ben = add("ben@example.com", "Ben");
  cy = add("cy@example.com", "Cy");
  spotify = db.insert(s.subscriptions).values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 7550 }).returning().get();
});

const dinner = (over: Record<string, unknown> = {}) => ({
  billId: uuid(),
  title: "Dinner at Gerry's",
  note: "Thanks for coming!",
  dueDate: DUE_DATE,
  split: { v: 1, method: "EQUAL", totalMinor: 90000, participants: [admin.id, ana.id, ben.id] },
  actorId: admin.id,
  now: NOW,
  ...over,
});

function created(result: ReturnType<typeof createBill>) {
  if (!result.ok) throw new Error(`expected a bill, got ${JSON.stringify(result)}`);
  return result;
}

describe("createBill", () => {
  it("issues a statement to everyone except the admin who fronted the money, and stores how it was split", () => {
    const result = created(createBill(db, dinner()));

    expect(result.created).toBe(true);
    expect(result.bill).toMatchObject({ title: "Dinner at Gerry's", totalMinor: 90000, splitMethod: "EQUAL", createdBy: admin.id, currency: "PHP" });
    expect(result.bill.splitResult.shares).toHaveLength(3);
    expect(result.statements.map((st) => st.userId).sort()).toEqual([ana.id, ben.id].sort());
    for (const st of result.statements) {
      expect(st).toMatchObject({
        billId: result.bill.id,
        subscriptionName: "Dinner at Gerry's",
        period: "2026-10",
        amountMinor: 30000,
        outstandingMinor: 30000,
        currency: "PHP",
        status: "UNPAID",
        dueAt: DUE,
      });
      expect(st.reference).toMatch(/^AMBAG-202610-[A-Z0-9]{6}$/);
    }
  });

  it("leaves out people whose share is zero", () => {
    const result = created(
      createBill(
        db,
        dinner({
          split: { v: 1, method: "SHARES", totalMinor: 10000, entries: [{ userId: ana.id, shares: 1 }, { userId: ben.id, shares: 0 }, { userId: cy.id, shares: 1 }] },
        }),
      ),
    );
    expect(result.statements.map((st) => st.userId).sort()).toEqual([ana.id, cy.id].sort());
  });

  it("queues the 'your ambag is ready' email for each friend, once", () => {
    const result = created(createBill(db, dinner()));
    const mails = db.select().from(s.emailLogs).all();
    expect(mails).toHaveLength(2);
    for (const st of result.statements) {
      const mail = mails.find((m) => m.statementId === st.id)!;
      expect(mail.type).toBe("SOA_GENERATED");
      expect(mail.dedupeKey).toBe(`SOA_GENERATED:${st.id}`);
      expect(JSON.parse(mail.payload)).toMatchObject({ subscription: "Dinner at Gerry's", isBill: "1", amount: "₱300.00" });
    }
  });

  it("is safe to submit twice: the same bill id returns the same bill and creates nothing new", () => {
    const input = dinner();
    const first = created(createBill(db, input));
    const again = created(createBill(db, input));
    expect(again.created).toBe(false);
    expect(again.bill.id).toBe(first.bill.id);
    expect(again.statements.map((st) => st.id).sort()).toEqual(first.statements.map((st) => st.id).sort());
    expect(db.select().from(s.statements).all()).toHaveLength(2);
    expect(db.select().from(s.emailLogs).all()).toHaveLength(2);
    expect(db.select().from(s.bills).all()).toHaveLength(1);
  });

  it("lets the same friend be in two bills in the same month", () => {
    created(createBill(db, dinner()));
    created(createBill(db, dinner({ title: "Internet", split: { v: 1, method: "EQUAL", totalMinor: 30000, participants: [admin.id, ana.id] } })));
    expect(db.select().from(s.statements).where(eq(s.statements.userId, ana.id)).all()).toHaveLength(2);
  });

  it("works for friends without an account (guests) just the same", () => {
    const guest = db.insert(s.users).values({ email: "guest-1@guests.invalid", name: "Tito Boy", isGuest: true }).returning().get();
    const result = created(createBill(db, dinner({ split: { v: 1, method: "EQUAL", totalMinor: 20000, participants: [admin.id, guest.id] } })));
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0].userId).toBe(guest.id);
    // There is nobody to email at a placeholder address: the admin shares the guest's link instead.
    expect(db.select().from(s.emailLogs).all()).toHaveLength(0);
  });

  it("records who created it and the numbers in the audit log", () => {
    const result = created(createBill(db, dinner()));
    const entry = db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "bill.created")).get()!;
    expect(entry).toMatchObject({ actorId: admin.id, entityType: "bill", entityId: result.bill.id });
    expect(JSON.parse(entry.metadata)).toMatchObject({ title: "Dinner at Gerry's", totalMinor: 90000, method: "EQUAL", collectingFrom: 2 });
  });

  it("refuses anyone who is not an active admin", () => {
    expect(createBill(db, dinner({ actorId: ana.id }))).toEqual({ ok: false, error: "FORBIDDEN" });
    db.update(s.users).set({ isActive: false }).where(eq(s.users.id, otherAdmin.id)).run();
    expect(createBill(db, dinner({ actorId: otherAdmin.id }))).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(db.select().from(s.bills).all()).toHaveLength(0);
  });

  it("checks the basics: id, title, note and due date", () => {
    expect(createBill(db, dinner({ billId: "x" }))).toEqual({ ok: false, error: "INVALID_BILL_ID" });
    expect(createBill(db, dinner({ title: "   " }))).toEqual({ ok: false, error: "TITLE_REQUIRED" });
    expect(createBill(db, dinner({ title: "x".repeat(81) }))).toEqual({ ok: false, error: "TITLE_TOO_LONG" });
    expect(createBill(db, dinner({ note: "x".repeat(501) }))).toEqual({ ok: false, error: "NOTE_TOO_LONG" });
    expect(createBill(db, dinner({ dueDate: "2026-10-04" }))).toEqual({ ok: false, error: "DUE_IN_PAST" });
    for (const bad of ["garbage", "2026-02-30", "20-10-2026", "", "2026-10-20T10:00"]) {
      expect(createBill(db, dinner({ dueDate: bad })), bad).toEqual({ ok: false, error: "INVALID_DUE_DATE" });
    }
  });

  it("makes a bill due at the END of its due day in Manila, like a monthly statement, and allows 'due today'", () => {
    // NOW is Oct 5 at noon in Manila: a bill due today is fine and is not overdue until the day has ended.
    const today = created(createBill(db, dinner({ dueDate: "2026-10-05" })));
    expect(today.statements[0].dueAt).toEqual(new Date("2026-10-05T15:59:59.999Z"));
    expect(endOfManilaDay("2026-10-05")).toEqual(new Date("2026-10-05T15:59:59.999Z"));
    expect(endOfManilaDay("2026-02-30")).toBeNull();
  });

  it("will not resubmit a bill that has since been cancelled", () => {
    const input = dinner();
    created(createBill(db, input));
    expect(cancelBill(db, { billId: input.billId, actorId: admin.id, reason: "Mistake", now: NOW }).ok).toBe(true);
    expect(createBill(db, input)).toEqual({ ok: false, error: "BILL_CANCELLED" });
  });

  it("adds up exactly on awkward totals: statements plus the admin's own share equal the bill", () => {
    for (const split of [
      { v: 1, method: "EQUAL", totalMinor: 10000, participants: [admin.id, ana.id, ben.id] },
      { v: 1, method: "EQUAL", totalMinor: 99999, participants: [admin.id, ana.id, ben.id, cy.id] },
      {
        v: 1,
        method: "ITEMS",
        items: [
          { id: "a", label: "A", priceMinor: 12345, assignees: [admin.id, ana.id, ben.id] },
          { id: "b", label: "B", priceMinor: 777, assignees: [ana.id, cy.id] },
        ],
        extras: [
          { id: "t", kind: "TAX", mode: "PERCENT", bp: 1200, allocate: "PROPORTIONAL" },
          { id: "d", kind: "DELIVERY", mode: "AMOUNT", valueMinor: 9901, allocate: "EQUAL" },
        ],
      },
    ]) {
      const { bill, statements } = created(createBill(db, dinner({ split })));
      const detail = getBillDetail(db, bill.id, NOW)!;
      const collected = statements.reduce((sum, st) => sum + st.amountMinor, 0);
      expect(collected + detail.adminShareMinor).toBe(bill.totalMinor);
    }
  });

  it("retries a colliding reference, and if it cannot find a free one it creates nothing at all", () => {
    const firstDraws = ["AAAAAA", "DDDDDD"];
    const first = created(createBill(db, dinner({ suffix: () => firstDraws.shift()! })));
    expect(first.statements.map((st) => st.reference).sort()).toEqual(["AMBAG-202610-AAAAAA", "AMBAG-202610-DDDDDD"]);

    // The next bill's first draw collides with it, then a fresh one is used.
    const draws = ["AAAAAA", "BBBBBB", "CCCCCC"];
    const second = created(createBill(db, dinner({ title: "Gift", suffix: () => draws.shift() ?? "ZZZZZZ" })));
    expect(second.statements.map((st) => st.reference).sort()).toEqual(["AMBAG-202610-BBBBBB", "AMBAG-202610-CCCCCC"]);

    // Never a free reference: the whole bill is rolled back, including its audit entry and emails.
    const before = { bills: db.select().from(s.bills).all().length, mails: db.select().from(s.emailLogs).all().length, audits: db.select().from(s.auditLogs).all().length };
    const billId = uuid();
    expect(() => createBill(db, dinner({ billId, title: "Stuck", suffix: () => "AAAAAA" }))).toThrow(/unique statement reference/);
    expect(db.select().from(s.bills).where(eq(s.bills.id, billId)).all()).toHaveLength(0);
    expect(db.select().from(s.statements).where(eq(s.statements.billId, billId)).all()).toHaveLength(0);
    expect({ bills: db.select().from(s.bills).all().length, mails: db.select().from(s.emailLogs).all().length, audits: db.select().from(s.auditLogs).all().length }).toEqual(before);
  });

  it("returns the split's own plain-language problems", () => {
    const result = createBill(db, dinner({ split: { v: 1, method: "PERCENT", totalMinor: 10000, entries: [{ userId: ana.id, bp: 3333 }] } }));
    expect(result).toMatchObject({ ok: false, error: "SPLIT_INVALID" });
    if (!result.ok && result.error === "SPLIT_INVALID") expect(result.issues[0].code).toBe("PERCENT_NOT_100");
    expect(db.select().from(s.bills).all()).toHaveLength(0);
  });

  it("refuses people who do not exist or have been deactivated", () => {
    expect(createBill(db, dinner({ split: { v: 1, method: "EQUAL", totalMinor: 100, participants: [ana.id, "nobody"] } }))).toEqual({ ok: false, error: "UNKNOWN_PARTICIPANT" });
    db.update(s.users).set({ isActive: false }).where(eq(s.users.id, ben.id)).run();
    expect(createBill(db, dinner())).toEqual({ ok: false, error: "UNKNOWN_PARTICIPANT" });
  });

  it("refuses a bill with nobody to collect from", () => {
    expect(createBill(db, dinner({ split: { v: 1, method: "EQUAL", totalMinor: 5000, participants: [admin.id] } }))).toEqual({ ok: false, error: "NOBODY_TO_COLLECT_FROM" });
  });

  it("treats a second admin like any friend: they get a statement", () => {
    const result = created(createBill(db, dinner({ split: { v: 1, method: "EQUAL", totalMinor: 20000, participants: [admin.id, otherAdmin.id] } })));
    expect(result.statements.map((st) => st.userId)).toEqual([otherAdmin.id]);
  });

  it("does not disturb the monthly plan: statements are still generated once per member and month", () => {
    created(createBill(db, dinner()));
    db.insert(s.memberships).values({ userId: ana.id, subscriptionId: spotify.id, startPeriod: "2026-10" }).run();
    expect(generateStatements(db, { period: "2026-10", now: NOW, actorId: null })).toEqual({ created: 1, existing: 0 });
    expect(generateStatements(db, { period: "2026-10", now: NOW, actorId: null })).toEqual({ created: 0, existing: 1 });
  });
});

describe("the hidden one-off plan", () => {
  it("is shared by every bill, never listed, never editable, and its prefix is reserved", () => {
    created(createBill(db, dinner()));
    created(createBill(db, dinner({ title: "Gift" })));
    const plans = db.select().from(s.subscriptions).where(eq(s.subscriptions.kind, "ONE_OFF")).all();
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ refPrefix: "AMBAG", isActive: false, feeMinor: 0 });

    expect(listSubscriptions(db).map((p) => p.name)).toEqual(["Spotify"]);
    expect(updateSubscription(db, plans[0].id, { name: "x", feeMinor: 1, issueDay: 1, dueDay: 1, paymentInstructions: null, isActive: true }, admin.id)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(createSubscription(db, { name: "Mine", refPrefix: "AMBAG", feeMinor: 100, issueDay: 1, dueDay: 10, paymentInstructions: null, isActive: true }, admin.id)).toEqual({
      ok: false,
      error: "PREFIX_TAKEN",
    });
  });

  it("copes when a recurring plan already took the AMBAG prefix before this feature existed", () => {
    db.insert(s.subscriptions).values({ name: "Old", refPrefix: "AMBAG", feeMinor: 100 }).run();
    const result = created(createBill(db, dinner()));
    expect(result.statements[0].reference).toMatch(/^AMB[A-Z]{3}-202610-/);
    expect(result.statements[0].reference.startsWith("AMBAG-")).toBe(false);
  });
});

describe("cancelBill", () => {
  it("cancels every unpaid statement and marks the bill cancelled", () => {
    const { bill, statements } = created(createBill(db, dinner()));
    const result = cancelBill(db, { billId: bill.id, actorId: admin.id, reason: "Wrong total", now: NOW });
    expect(result).toEqual({ ok: true, cancelled: 2 });
    for (const st of statements) {
      expect(db.select().from(s.statements).where(eq(s.statements.id, st.id)).get()).toMatchObject({ status: "CANCELLED", outstandingMinor: 0, cancelReason: "Wrong total" });
    }
    expect(db.select().from(s.bills).where(eq(s.bills.id, bill.id)).get()!.cancelledAt).toEqual(NOW);
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "bill.cancelled")).all()).toHaveLength(1);
  });

  it("refuses, changing nothing, when anyone has paid or reported paying", () => {
    const { bill, statements } = created(createBill(db, dinner()));
    db.update(s.statements).set({ status: "UNDER_VERIFICATION" }).where(eq(s.statements.id, statements[0].id)).run();
    const result = cancelBill(db, { billId: bill.id, actorId: admin.id, reason: "Oops", now: NOW });
    expect(result).toMatchObject({ ok: false, error: "BLOCKED" });
    if (!result.ok && result.error === "BLOCKED") expect(result.blockedBy).toEqual([{ statementId: statements[0].id, userId: statements[0].userId, status: "UNDER_VERIFICATION" }]);
    expect(db.select().from(s.statements).where(eq(s.statements.status, "CANCELLED")).all()).toHaveLength(0);
    expect(db.select().from(s.bills).get()!.cancelledAt).toBeNull();
  });

  it("still cancels what is left when some statements were cancelled one by one earlier", () => {
    const { bill, statements } = created(createBill(db, dinner()));
    db.update(s.statements).set({ status: "CANCELLED", outstandingMinor: 0 }).where(eq(s.statements.id, statements[0].id)).run();
    expect(cancelBill(db, { billId: bill.id, actorId: admin.id, reason: "Mistake", now: NOW })).toEqual({ ok: true, cancelled: 1 });
  });

  it("refuses when someone has already paid, and a cancelled bill queues no reminders afterwards", () => {
    const { bill, statements } = created(createBill(db, dinner({ dueDate: "2026-10-06" })));
    db.update(s.statements).set({ status: "PAID", outstandingMinor: 0 }).where(eq(s.statements.id, statements[0].id)).run();
    expect(cancelBill(db, { billId: bill.id, actorId: admin.id, reason: "Mistake", now: NOW })).toMatchObject({ ok: false, error: "BLOCKED" });
    db.update(s.statements).set({ status: "UNPAID", outstandingMinor: 30000 }).where(eq(s.statements.id, statements[0].id)).run();
    expect(cancelBill(db, { billId: bill.id, actorId: admin.id, reason: "Mistake", now: NOW }).ok).toBe(true);
    const before = db.select().from(s.emailLogs).all().length;
    reconcile(db, NOW); // the day before it was due: a reminder would go out if it were still owed
    expect(db.select().from(s.emailLogs).all()).toHaveLength(before);
  });

  it("checks who is asking, the reason, and whether it was already cancelled", () => {
    const { bill } = created(createBill(db, dinner()));
    expect(cancelBill(db, { billId: bill.id, actorId: ana.id, reason: "No", now: NOW })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(cancelBill(db, { billId: "missing", actorId: admin.id, reason: "Oops", now: NOW })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(cancelBill(db, { billId: bill.id, actorId: admin.id, reason: " ", now: NOW })).toEqual({ ok: false, error: "REASON_REQUIRED" });
    expect(cancelBill(db, { billId: bill.id, actorId: admin.id, reason: "x".repeat(201), now: NOW })).toEqual({ ok: false, error: "REASON_TOO_LONG" });
    expect(cancelBill(db, { billId: bill.id, actorId: admin.id, reason: "Oops", now: NOW }).ok).toBe(true);
    expect(cancelBill(db, { billId: bill.id, actorId: admin.id, reason: "Again", now: NOW })).toEqual({ ok: false, error: "ALREADY_CANCELLED" });
  });
});

describe("reading bills", () => {
  it("lists bills newest first with what is still owed", () => {
    created(createBill(db, dinner({ title: "First", now: new Date("2026-10-05T04:00:00Z") })));
    created(createBill(db, dinner({ title: "Second", now: new Date("2026-10-06T04:00:00Z") })));
    const rows = listBills(db);
    expect(rows.map((r) => r.bill.title)).toEqual(["Second", "First"]);
    expect(rows[0]).toMatchObject({ statementCount: 2, paidCount: 0, openCount: 2, outstandingMinor: 60000 });
  });

  it("shows the admin each person's share and status, plus the admin's own share", () => {
    const { bill } = created(createBill(db, dinner()));
    const detail = getBillDetail(db, bill.id, NOW)!;
    expect(detail.bill.id).toBe(bill.id);
    expect(detail.adminShareMinor).toBe(30000);
    expect(detail.rows.map((r) => [r.memberName, r.amountMinor, r.status]).sort()).toEqual([["Ana", 30000, "UNPAID"], ["Ben", 30000, "UNPAID"]]);
    expect(getBillDetail(db, "missing", NOW)).toBeNull();
  });

  it("gives a friend only their own slice of the split, never anyone else's", () => {
    const { bill, statements } = created(
      createBill(
        db,
        dinner({
          split: {
            v: 1,
            method: "ITEMS",
            items: [
              { id: "pizza", label: "Pizza", priceMinor: 60000, assignees: [ana.id, ben.id] },
              { id: "beer", label: "Beer", priceMinor: 9000, assignees: [ana.id] },
            ],
            extras: [],
          },
        }),
      ),
    );
    const anaStatement = statements.find((st) => st.userId === ana.id)!;
    const share = getShareForStatement(db, ana.id, anaStatement.id)!;
    expect(share).toMatchObject({ title: "Dinner at Gerry's", note: "Thanks for coming!", totalMinor: 69000, method: "ITEMS", participantCount: 2, amountMinor: 39000 });
    expect(share.lines.map((l) => [l.label, l.amountMinor])).toEqual([["Pizza", 30000], ["Beer", 9000]]);
    expect(JSON.stringify(share)).not.toContain(ben.id);
    // Someone else's statement, a missing one, and a monthly statement all read as "nothing".
    expect(getShareForStatement(db, ben.id, anaStatement.id)).toBeNull();
    expect(getShareForStatement(db, ana.id, "missing")).toBeNull();
    const monthly = db
      .insert(s.statements)
      .values({ reference: "SPOT-1", userId: ana.id, subscriptionId: spotify.id, period: "2026-10", subscriptionName: "Spotify", amountMinor: 1, outstandingMinor: 1, currency: "PHP", issuedAt: NOW, dueAt: DUE })
      .returning()
      .get();
    expect(getShareForStatement(db, ana.id, monthly.id)).toBeNull();
    expect(bill.id).toBeTruthy();
  });
});

describe("how bills show up elsewhere", () => {
  it("keeps bills out of the month's subscription tiles but counts them as open ambag and still owed", () => {
    created(createBill(db, dinner()));
    db.insert(s.statements)
      .values({ reference: "SPOT-1", userId: ana.id, subscriptionId: spotify.id, period: "2026-10", subscriptionName: "Spotify", amountMinor: 7550, outstandingMinor: 7550, currency: "PHP", issuedAt: NOW, dueAt: DUE })
      .run();
    const overview = getAdminOverview(db, NOW);
    expect(overview.cycle.count).toBe(1);
    expect(overview.cycle.chargedMinor).toBe(7550);
    expect(overview.tickets).toHaveLength(1);
    expect(overview.ambagOpen).toBe(2);
    expect(overview.outstandingMinor).toBe(7550 + 60000);
  });

  it("names a bill on the friend's activity feed by its title, not by a month", () => {
    created(createBill(db, dinner()));
    const dashboard = getMemberDashboard(db, ana.id, NOW);
    expect(dashboard.activity.map((a) => a.label)).toContain("Ambag issued: Dinner at Gerry's");
  });
});
