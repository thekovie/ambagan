import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { dueDateOf, issueDateOf } from "@/server/billing/dates";
import { cancelStatement } from "@/server/billing/statements";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { parsePaymentForm } from "@/server/payments/form";
import { submitPayment } from "@/server/payments/submit";
import {
  approvePayment,
  declinePayment,
  listPendingPayments,
  listReviewedPayments,
} from "@/server/payments/verify";
import { createTestDb } from "./helpers/db";

let db: Db;
let admin: typeof s.users.$inferSelect;
let ana: typeof s.users.$inferSelect;
let ben: typeof s.users.$inferSelect;
let spotify: typeof s.subscriptions.$inferSelect;
let gcash: typeof s.paymentMethods.$inferSelect;
const NOW = new Date("2026-10-05T04:00:00Z"); // Oct 5, before the 10th
const AFTER_DUE = new Date("2026-10-12T04:00:00Z");

let seq = 0;
function addStatement(userId: string, period = "2026-10", over: Partial<typeof s.statements.$inferInsert> = {}) {
  seq += 1;
  return db
    .insert(s.statements)
    .values({
      reference: `SPOT-${period.replace("-", "")}-V${String(seq).padStart(5, "0")}`,
      userId,
      subscriptionId: spotify.id,
      period,
      subscriptionName: "Spotify",
      amountMinor: 7550,
      outstandingMinor: 7550,
      currency: "PHP",
      issuedAt: issueDateOf(period, 1),
      dueAt: dueDateOf(period, 10),
      status: "UNPAID",
      ...over,
    })
    .returning()
    .get();
}

/** Member reports a payment through the real submission service. */
function report(userId: string, statementId: string, over: Record<string, unknown> = {}) {
  const parsed = parsePaymentForm(
    {
      statementId,
      destinationMethodId: gcash.id,
      sendingApp: "Maya",
      amountPesos: "75.50",
      transactionRef: `REF ${++seq} ${Math.random().toString(36).slice(2, 8)}`,
      transactionDate: "2026-10-04T16:25",
      notes: "",
      ...over,
    },
    NOW,
  );
  if (!parsed.ok) throw new Error(`form rejected: ${JSON.stringify(parsed.errors)}`);
  const res = submitPayment(db, { userId, input: parsed.value, now: NOW });
  if (!res.ok) throw new Error(`submit failed: ${res.error}`);
  return res.payment;
}

const statementOf = (id: string) => db.select().from(s.statements).where(eq(s.statements.id, id)).get()!;
const paymentOf = (id: string) => db.select().from(s.payments).where(eq(s.payments.id, id)).get()!;

beforeEach(() => {
  db = createTestDb();
  admin = db.insert(s.users).values({ email: "boss@example.com", name: "Boss", role: "ADMIN" }).returning().get();
  ana = db.insert(s.users).values({ email: "ana@example.com", name: "Ana" }).returning().get();
  ben = db.insert(s.users).values({ email: "ben@example.com", name: "Ben" }).returning().get();
  spotify = db.insert(s.subscriptions).values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 7550 }).returning().get();
  gcash = db.insert(s.paymentMethods).values({ kind: "GCASH", label: "GCash", accountName: "Kovie D.", accountNumber: "0917", isActive: true }).returning().get();
});

describe("approvePayment", () => {
  it("settles the statement: payment approved, reviewer recorded, balance zero, audit entry", () => {
    const st = addStatement(ana.id);
    const p = report(ana.id, st.id);
    const res = approvePayment(db, { paymentId: p.id, adminId: admin.id, now: NOW });
    expect(res).toMatchObject({ ok: true, changed: true });
    expect(paymentOf(p.id)).toMatchObject({ status: "APPROVED", reviewedBy: admin.id, reviewedAt: NOW, adjustmentNote: null });
    expect(statementOf(st.id)).toMatchObject({ status: "PAID", outstandingMinor: 0, amountMinor: 7550 });
    const log = db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "payment.approved")).get()!;
    expect(log).toMatchObject({ actorId: admin.id, entityId: p.id });
  });

  it("is idempotent: approving again changes nothing and writes no second audit entry", () => {
    const st = addStatement(ana.id);
    const p = report(ana.id, st.id);
    approvePayment(db, { paymentId: p.id, adminId: admin.id, now: NOW });
    const later = new Date(NOW.getTime() + 60_000);
    expect(approvePayment(db, { paymentId: p.id, adminId: admin.id, now: later })).toMatchObject({ ok: true, changed: false });
    expect(paymentOf(p.id).reviewedAt).toEqual(NOW); // original decision time kept
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "payment.approved")).all()).toHaveLength(1);
  });

  it("refuses a different amount unless the admin records an adjustment", () => {
    const st = addStatement(ana.id);
    const p = report(ana.id, st.id, { amountPesos: "50" });
    const res = approvePayment(db, { paymentId: p.id, adminId: admin.id, now: NOW });
    expect(res).toEqual({ ok: false, error: "AMOUNT_MISMATCH", expectedMinor: 7550, submittedMinor: 5000, currency: "PHP" });
    expect(paymentOf(p.id).status).toBe("PENDING");
    expect(statementOf(st.id)).toMatchObject({ status: "UNDER_VERIFICATION", outstandingMinor: 7550 });
  });

  it("accepts a different amount with a recorded adjustment, settling the statement and keeping the note", () => {
    const st = addStatement(ana.id);
    const p = report(ana.id, st.id, { amountPesos: "50" });
    const res = approvePayment(db, { paymentId: p.id, adminId: admin.id, adjustmentNote: "Agreed to waive the rest", now: NOW });
    expect(res).toMatchObject({ ok: true, changed: true });
    expect(paymentOf(p.id)).toMatchObject({ status: "APPROVED", adjustmentNote: "Agreed to waive the rest", amountMinor: 5000 });
    expect(statementOf(st.id)).toMatchObject({ status: "PAID", outstandingMinor: 0 });
  });

  it("treats an overpayment the same way (needs an explicit note)", () => {
    const st = addStatement(ana.id);
    const p = report(ana.id, st.id, { amountPesos: "100" });
    expect(approvePayment(db, { paymentId: p.id, adminId: admin.id, now: NOW })).toMatchObject({ ok: false, error: "AMOUNT_MISMATCH" });
    expect(approvePayment(db, { paymentId: p.id, adminId: admin.id, adjustmentNote: "Keeping the extra as credit", now: NOW }).ok).toBe(true);
  });

  it("enforces the adjustment note's length on the server (HTML attributes are only hints)", () => {
    const st = addStatement(ana.id);
    const p = report(ana.id, st.id, { amountPesos: "50" });
    expect(approvePayment(db, { paymentId: p.id, adminId: admin.id, adjustmentNote: "ok", now: NOW })).toEqual({ ok: false, error: "ADJUSTMENT_TOO_SHORT" });
    expect(approvePayment(db, { paymentId: p.id, adminId: admin.id, adjustmentNote: "x".repeat(201), now: NOW })).toEqual({ ok: false, error: "ADJUSTMENT_TOO_LONG" });
    expect(paymentOf(p.id).status).toBe("PENDING");
  });

  it("reports the statement's own currency when the amounts differ", () => {
    const st = addStatement(ana.id, "2026-10", { currency: "USD" });
    const p = report(ana.id, st.id, { amountPesos: "50" });
    expect(approvePayment(db, { paymentId: p.id, adminId: admin.id, now: NOW })).toMatchObject({ error: "AMOUNT_MISMATCH", currency: "USD" });
  });

  it("refuses to approve or decline when the statement is not under verification (broken invariant)", () => {
    const st = addStatement(ana.id);
    const p = report(ana.id, st.id);
    db.update(s.statements).set({ status: "CANCELLED", outstandingMinor: 0 }).where(eq(s.statements.id, st.id)).run();
    expect(approvePayment(db, { paymentId: p.id, adminId: admin.id, now: NOW })).toEqual({ ok: false, error: "NOT_PENDING" });
    expect(declinePayment(db, { paymentId: p.id, adminId: admin.id, reason: "Did not arrive", now: NOW })).toEqual({ ok: false, error: "NOT_PENDING" });
    expect(statementOf(st.id).status).toBe("CANCELLED"); // never silently reopened
  });

  it("a statement under verification cannot be cancelled out from under its pending payment", () => {
    const st = addStatement(ana.id);
    report(ana.id, st.id);
    expect(cancelStatement(db, { statementId: st.id, actorId: admin.id, reason: "Waived" })).toEqual({ ok: false, error: "NOT_CANCELLABLE" });
  });

  it("ignores a blank adjustment note", () => {
    const st = addStatement(ana.id);
    const p = report(ana.id, st.id, { amountPesos: "50" });
    expect(approvePayment(db, { paymentId: p.id, adminId: admin.id, adjustmentNote: "   ", now: NOW })).toMatchObject({ ok: false, error: "AMOUNT_MISMATCH" });
  });

  it("cannot approve a declined payment, or one that doesn't exist", () => {
    const st = addStatement(ana.id);
    const p = report(ana.id, st.id);
    declinePayment(db, { paymentId: p.id, adminId: admin.id, reason: "Did not arrive", now: NOW });
    expect(approvePayment(db, { paymentId: p.id, adminId: admin.id, now: NOW })).toEqual({ ok: false, error: "NOT_PENDING" });
    expect(approvePayment(db, { paymentId: "nope", adminId: admin.id, now: NOW })).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("only an active administrator can approve (defence in depth behind the action's own check)", () => {
    const st = addStatement(ana.id);
    const p = report(ana.id, st.id);
    expect(approvePayment(db, { paymentId: p.id, adminId: ana.id, now: NOW })).toEqual({ ok: false, error: "FORBIDDEN" });
    db.update(s.users).set({ isActive: false }).where(eq(s.users.id, admin.id)).run();
    expect(approvePayment(db, { paymentId: p.id, adminId: admin.id, now: NOW })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(paymentOf(p.id).status).toBe("PENDING");
    expect(statementOf(st.id).status).toBe("UNDER_VERIFICATION");
  });

  it("an approved payment cannot be declined afterwards", () => {
    const st = addStatement(ana.id);
    const p = report(ana.id, st.id);
    approvePayment(db, { paymentId: p.id, adminId: admin.id, now: NOW });
    expect(declinePayment(db, { paymentId: p.id, adminId: admin.id, reason: "Changed my mind", now: NOW })).toEqual({ ok: false, error: "NOT_PENDING" });
    expect(statementOf(st.id).status).toBe("PAID");
  });
});

describe("declinePayment", () => {
  it("keeps the submission, records who and why, and puts the statement back to unpaid", () => {
    const st = addStatement(ana.id);
    const p = report(ana.id, st.id);
    const res = declinePayment(db, { paymentId: p.id, adminId: admin.id, reason: "  Amount did not arrive  ", now: NOW });
    expect(res).toMatchObject({ ok: true, changed: true });
    expect(paymentOf(p.id)).toMatchObject({
      status: "DECLINED",
      reviewedBy: admin.id,
      reviewedAt: NOW,
      declineReason: "Amount did not arrive",
      amountMinor: 7550,
      transactionRef: p.transactionRef, // the original submission is preserved
    });
    expect(statementOf(st.id)).toMatchObject({ status: "UNPAID", outstandingMinor: 7550 });
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "payment.declined")).all()).toHaveLength(1);
  });

  it("returns a statement that is past its due day to overdue, not unpaid", () => {
    const st = addStatement(ana.id);
    const p = report(ana.id, st.id);
    declinePayment(db, { paymentId: p.id, adminId: admin.id, reason: "Did not arrive", now: AFTER_DUE });
    expect(statementOf(st.id).status).toBe("OVERDUE");
  });

  it("requires a real reason", () => {
    const p = report(ana.id, addStatement(ana.id).id);
    expect(declinePayment(db, { paymentId: p.id, adminId: admin.id, reason: "  ", now: NOW })).toEqual({ ok: false, error: "REASON_REQUIRED" });
    expect(declinePayment(db, { paymentId: p.id, adminId: admin.id, reason: "x".repeat(301), now: NOW })).toEqual({ ok: false, error: "REASON_TOO_LONG" });
    expect(paymentOf(p.id).status).toBe("PENDING");
  });

  it("is idempotent for a repeated decline and never reopens the first decision", () => {
    const p = report(ana.id, addStatement(ana.id).id);
    declinePayment(db, { paymentId: p.id, adminId: admin.id, reason: "Did not arrive", now: NOW });
    const again = declinePayment(db, { paymentId: p.id, adminId: admin.id, reason: "Different reason", now: AFTER_DUE });
    expect(again).toMatchObject({ ok: true, changed: false });
    expect(paymentOf(p.id).declineReason).toBe("Did not arrive");
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "payment.declined")).all()).toHaveLength(1);
  });

  it("only an active administrator can decline", () => {
    const p = report(ana.id, addStatement(ana.id).id);
    expect(declinePayment(db, { paymentId: p.id, adminId: ana.id, reason: "Nope here", now: NOW })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(paymentOf(p.id).status).toBe("PENDING");
  });

  it("lets the member report again, even with the same reference", () => {
    const st = addStatement(ana.id);
    const p = report(ana.id, st.id, { transactionRef: "AAAA 1111 2222" });
    declinePayment(db, { paymentId: p.id, adminId: admin.id, reason: "Typo in the amount", now: NOW });
    const again = report(ana.id, st.id, { transactionRef: "AAAA 1111 2222" });
    expect(again.status).toBe("PENDING");
    expect(db.select().from(s.payments).where(eq(s.payments.statementId, st.id)).all()).toHaveLength(2);
  });
});

describe("listPendingPayments", () => {
  it("shows everything the admin needs to check the money, oldest first", () => {
    const a = report(ana.id, addStatement(ana.id).id, { amountPesos: "50" });
    const bSt = addStatement(ben.id);
    const b = report(ben.id, bSt.id, { sendingApp: "GoTyme" });
    db.update(s.payments).set({ submittedAt: new Date(NOW.getTime() + 60_000) }).where(eq(s.payments.id, b.id)).run();

    const rows = listPendingPayments(db);
    expect(rows.map((r) => r.id)).toEqual([a.id, b.id]);
    expect(rows[0]).toMatchObject({
      memberName: "Ana",
      memberEmail: "ana@example.com",
      subscriptionName: "Spotify",
      period: "2026-10",
      expectedMinor: 7550,
      submittedMinor: 5000,
      amountMatches: false,
      destinationLabel: "GCash",
      sendingApp: "Maya",
      transactionRef: a.transactionRef,
    });
    expect(rows[1]).toMatchObject({ amountMatches: true, sendingApp: "GoTyme" });
  });

  it("includes earlier declined attempts for the same statement as context", () => {
    const st = addStatement(ana.id);
    const first = report(ana.id, st.id, { transactionRef: "FIRST 1111 2222" });
    declinePayment(db, { paymentId: first.id, adminId: admin.id, reason: "Wrong amount", now: NOW });
    report(ana.id, st.id, { transactionRef: "SECOND 3333 4444" });
    const [row] = listPendingPayments(db);
    expect(row.previousAttempts).toEqual([
      { id: first.id, status: "DECLINED", declineReason: "Wrong amount", transactionRef: "FIRST 1111 2222", amountMinor: 7550 },
    ]);
  });

  it("flags a reference that was declined before (it may be reused for something else)", () => {
    const st = addStatement(ana.id);
    const first = report(ana.id, st.id, { transactionRef: "REUSED 5555 6666" });
    declinePayment(db, { paymentId: first.id, adminId: admin.id, reason: "Not found", now: NOW });
    const benSt = addStatement(ben.id);
    report(ben.id, benSt.id, { transactionRef: "reused-5555-6666" });
    const row = listPendingPayments(db).find((r) => r.memberName === "Ben")!;
    expect(row.referenceSeenDeclined).toBe(true);
  });

  it("leaves out payments that were already decided", () => {
    const p = report(ana.id, addStatement(ana.id).id);
    approvePayment(db, { paymentId: p.id, adminId: admin.id, now: NOW });
    expect(listPendingPayments(db)).toEqual([]);
  });
});

describe("listReviewedPayments", () => {
  it("lists decisions newest first with who decided and why", () => {
    const a = report(ana.id, addStatement(ana.id).id);
    const b = report(ben.id, addStatement(ben.id).id);
    approvePayment(db, { paymentId: a.id, adminId: admin.id, now: NOW });
    declinePayment(db, { paymentId: b.id, adminId: admin.id, reason: "Did not arrive", now: new Date(NOW.getTime() + 60_000) });
    const rows = listReviewedPayments(db, 10);
    expect(rows.map((r) => [r.memberName, r.status, r.reviewerName, r.declineReason])).toEqual([
      ["Ben", "DECLINED", "Boss", "Did not arrive"],
      ["Ana", "APPROVED", "Boss", null],
    ]);
  });

  it("respects the limit", () => {
    for (let i = 0; i < 3; i++) {
      const p = report(ana.id, addStatement(ana.id, `2026-0${i + 1}`).id);
      approvePayment(db, { paymentId: p.id, adminId: admin.id, now: new Date(NOW.getTime() + i * 1000) });
    }
    expect(listReviewedPayments(db, 2)).toHaveLength(2);
  });
});
