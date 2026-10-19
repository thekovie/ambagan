import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { dueDateOf, issueDateOf } from "@/server/billing/dates";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { normalizeReference, parsePaymentForm } from "@/server/payments/form";
import { listPaymentsForUser } from "@/server/payments/history";
import { submitPayment } from "@/server/payments/submit";
import { createTestDb } from "./helpers/db";

let db: Db;
let ana: typeof s.users.$inferSelect;
let ben: typeof s.users.$inferSelect;
let spotify: typeof s.subscriptions.$inferSelect;
let gcash: typeof s.paymentMethods.$inferSelect;
const NOW = new Date("2026-10-05T04:00:00Z"); // Oct 5, 12:00 Manila

let seq = 0;
function addStatement(userId: string, status: typeof s.statements.$inferInsert["status"] = "UNPAID", period = "2026-10") {
  seq += 1;
  return db
    .insert(s.statements)
    .values({
      reference: `SPOT-${period.replace("-", "")}-B${String(seq).padStart(5, "0")}`,
      userId,
      subscriptionId: spotify.id,
      period,
      subscriptionName: "Spotify",
      amountMinor: 7550,
      outstandingMinor: status === "PAID" || status === "CANCELLED" ? 0 : 7550,
      currency: "PHP",
      issuedAt: issueDateOf(period, 1),
      dueAt: dueDateOf(period, 10),
      status,
    })
    .returning()
    .get();
}

const payload = (statementId: string, over: Record<string, unknown> = {}) => ({
  statementId,
  destinationMethodId: gcash.id,
  sendingApp: "Maya",
  amountPesos: "75.50",
  transactionRef: "7034 512 840193",
  transactionDate: "2026-10-04T16:25",
  notes: "",
  ...over,
});

function submit(statementId: string, over: Record<string, unknown> = {}, userId = ana.id) {
  const parsed = parsePaymentForm(payload(statementId, over), NOW);
  if (!parsed.ok) throw new Error(`form rejected: ${JSON.stringify(parsed.errors)}`);
  return submitPayment(db, { userId, input: parsed.value, now: NOW });
}

beforeEach(() => {
  db = createTestDb();
  ana = db.insert(s.users).values({ email: "ana@example.com", name: "Ana" }).returning().get();
  ben = db.insert(s.users).values({ email: "ben@example.com", name: "Ben" }).returning().get();
  spotify = db.insert(s.subscriptions).values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 7550 }).returning().get();
  gcash = db.insert(s.paymentMethods).values({ kind: "GCASH", label: "GCash", accountName: "Kovie D.", accountNumber: "0917", isActive: true }).returning().get();
});

describe("normalizeReference", () => {
  it("compares references ignoring case, spaces and punctuation", () => {
    expect(normalizeReference("7034 512 840193")).toBe("7034512840193");
    expect(normalizeReference("mb-2610/104125987")).toBe("MB2610104125987");
    expect(normalizeReference("  4f9a1c2e8b7d ")).toBe("4F9A1C2E8B7D");
  });
});

describe("parsePaymentForm", () => {
  it("converts pesos to centavos and the Manila local time to a Date", () => {
    const res = parsePaymentForm(payload("st1"), NOW);
    expect(res.ok && res.value).toMatchObject({
      statementId: "st1",
      destinationMethodId: gcash.id,
      sendingApp: "Maya",
      amountMinor: 7550,
      transactionRef: "7034 512 840193",
      notes: null,
    });
    expect(res.ok && res.value.transactionDate.toISOString()).toBe("2026-10-04T08:25:00.000Z");
  });

  it.each([
    [{ amountPesos: "0" }, "amountPesos"],
    [{ amountPesos: "abc" }, "amountPesos"],
    [{ amountPesos: "50,50" }, "amountPesos"],
    [{ amountPesos: "1000000.01" }, "amountPesos"],
    [{ transactionRef: "12" }, "transactionRef"],
    [{ transactionRef: "<script>alert(1)</script>" }, "transactionRef"],
    [{ transactionRef: "x".repeat(65) }, "transactionRef"],
    [{ sendingApp: "  " }, "sendingApp"],
    [{ sendingApp: "x".repeat(41) }, "sendingApp"],
    [{ destinationMethodId: "" }, "destinationMethodId"],
    [{ notes: "x".repeat(301) }, "notes"],
    [{ transactionDate: "" }, "transactionDate"],
    [{ transactionDate: "yesterday" }, "transactionDate"],
    // JavaScript rolls these forward (Sep 31 -> Oct 1, hour 24 -> next day) instead of rejecting them,
    // and both land inside the accepted window, so only an explicit round-trip check catches them.
    [{ transactionDate: "2026-09-31T10:00" }, "transactionDate"],
    [{ transactionDate: "2026-10-04T24:00" }, "transactionDate"],
    [{ transactionDate: "2026-02-30T10:00" }, "transactionDate"],
    [{ transactionDate: "2026-10-07T12:00" }, "transactionDate"], // more than a day ahead of NOW
    [{ transactionDate: "2026-03-01T12:00" }, "transactionDate"], // more than 180 days before NOW
  ])("rejects %j", (override, field) => {
    const res = parsePaymentForm(payload("st1", override), NOW);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors)).toContain(field);
  });

  it("says the date doesn't exist (not 'too long ago') for a rolled-over day", () => {
    const res = parsePaymentForm(payload("st1", { transactionDate: "2026-09-31T10:00" }), NOW);
    expect(!res.ok && res.errors.transactionDate).toMatch(/doesn't exist/);
  });

  it("allows a few hours of clock skew into the future", () => {
    expect(parsePaymentForm(payload("st1", { transactionDate: "2026-10-05T14:00" }), NOW).ok).toBe(true);
  });
});

describe("submitPayment", () => {
  it("records a pending payment, keeps destination and sending app separate, and moves the statement under verification", () => {
    const st = addStatement(ana.id);
    const res = submit(st.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.payment).toMatchObject({
      statementId: st.id,
      userId: ana.id,
      destinationMethodId: gcash.id,
      sendingApp: "Maya",
      amountMinor: 7550,
      transactionRef: "7034 512 840193",
      transactionRefNorm: "7034512840193",
      status: "PENDING",
    });
    expect(res.amountMatches).toBe(true);
    expect(db.select().from(s.statements).where(eq(s.statements.id, st.id)).get()).toMatchObject({
      status: "UNDER_VERIFICATION",
      outstandingMinor: 7550, // nothing is paid until the admin approves
    });
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "payment.submitted")).all()).toHaveLength(1);
  });

  it("accepts a different amount but says so, so the admin and member can be warned", () => {
    const st = addStatement(ana.id);
    const res = submit(st.id, { amountPesos: "50" });
    expect(res.ok && res.amountMatches).toBe(false);
  });

  it("accepts an overdue statement", () => {
    expect(submit(addStatement(ana.id, "OVERDUE").id).ok).toBe(true);
  });

  it("only the owner can pay a statement; anyone else just gets 'not found'", () => {
    const st = addStatement(ana.id);
    expect(submit(st.id, {}, ben.id)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(submit("nope")).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.select().from(s.payments).all()).toHaveLength(0);
  });

  it.each(["PAID", "CANCELLED", "UNDER_VERIFICATION"] as const)("refuses a %s statement", (status) => {
    expect(submit(addStatement(ana.id, status).id)).toEqual({ ok: false, error: "NOT_PAYABLE" });
  });

  it("refuses an unknown or switched-off destination", () => {
    const st = addStatement(ana.id);
    db.update(s.paymentMethods).set({ isActive: false }).where(eq(s.paymentMethods.id, gcash.id)).run();
    expect(submit(st.id)).toEqual({ ok: false, error: "INVALID_DESTINATION" });
    expect(submit(st.id, { destinationMethodId: "nope" })).toEqual({ ok: false, error: "INVALID_DESTINATION" });
  });

  it("blocks a transaction reference that is already in use, however it is typed", () => {
    submit(addStatement(ana.id).id);
    const other = addStatement(ben.id);
    for (const variant of ["7034 512 840193", "7034512840193", "7034-512-840193"]) {
      expect(submit(other.id, { transactionRef: variant }, ben.id)).toEqual({ ok: false, error: "DUPLICATE_REFERENCE" });
    }
    expect(db.select().from(s.payments).all()).toHaveLength(1);
  });

  it("lets a member resubmit after a decline, even with the same reference", () => {
    const st = addStatement(ana.id);
    const first = submit(st.id);
    if (!first.ok) throw new Error("setup");
    // The admin declines: the payment is closed and the statement is payable again.
    db.update(s.payments).set({ status: "DECLINED", declineReason: "Amount did not arrive" }).where(eq(s.payments.id, first.payment.id)).run();
    db.update(s.statements).set({ status: "UNPAID" }).where(eq(s.statements.id, st.id)).run();

    const again = submit(st.id, { transactionRef: "7034 512 840193" });
    expect(again.ok).toBe(true);
    expect(db.select().from(s.payments).all()).toHaveLength(2); // the declined original is preserved
  });

  it("the database itself refuses a second pending payment for one statement (double-click safe)", () => {
    const st = addStatement(ana.id);
    const row = {
      statementId: st.id,
      userId: ana.id,
      destinationMethodId: gcash.id,
      sendingApp: "Maya",
      amountMinor: 7550,
      transactionDate: NOW,
    };
    db.insert(s.payments).values({ ...row, transactionRef: "AAAA1111", transactionRefNorm: "AAAA1111" }).run();
    expect(() => db.insert(s.payments).values({ ...row, transactionRef: "BBBB2222", transactionRefNorm: "BBBB2222" }).run()).toThrow(/UNIQUE/);
  });

  it("the database itself refuses a reference that is pending or approved elsewhere", () => {
    const a = addStatement(ana.id);
    const b = addStatement(ben.id);
    const base = { destinationMethodId: gcash.id, sendingApp: "Maya", amountMinor: 7550, transactionDate: NOW, transactionRef: "CCCC3333", transactionRefNorm: "CCCC3333" };
    db.insert(s.payments).values({ ...base, statementId: a.id, userId: ana.id, status: "APPROVED" }).run();
    expect(() => db.insert(s.payments).values({ ...base, statementId: b.id, userId: ben.id }).run()).toThrow(/UNIQUE/);
  });
});

describe("listPaymentsForUser", () => {
  it("lists only the member's own payments, newest first, with the statement they were for and any decline reason", () => {
    const stA = addStatement(ana.id, "UNPAID", "2026-09");
    const first = submit(stA.id, { transactionRef: "AAAA 1111 2222" });
    if (!first.ok) throw new Error("setup");
    db.update(s.payments).set({ status: "DECLINED", declineReason: "Amount did not arrive" }).where(eq(s.payments.id, first.payment.id)).run();
    db.update(s.statements).set({ status: "UNPAID" }).where(eq(s.statements.id, stA.id)).run();

    const stB = addStatement(ana.id, "UNPAID", "2026-10");
    const second = submitPayment(db, {
      userId: ana.id,
      input: { ...(parsePaymentForm(payload(stB.id, { transactionRef: "BBBB 3333 4444" }), NOW) as { ok: true; value: Parameters<typeof submitPayment>[1]["input"] }).value },
      now: new Date(NOW.getTime() + 60_000),
    });
    if (!second.ok) throw new Error("setup");
    submit(addStatement(ben.id).id, { transactionRef: "CCCC 5555 6666" }, ben.id);

    const rows = listPaymentsForUser(db, ana.id);
    expect(rows.map((r) => [r.period, r.status, r.declineReason])).toEqual([
      ["2026-10", "PENDING", null],
      ["2026-09", "DECLINED", "Amount did not arrive"],
    ]);
    expect(rows[0]).toMatchObject({ statementReference: stB.reference, destinationLabel: "GCash", amountMinor: 7550 });
  });
});
