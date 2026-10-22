import { and, asc, count, desc, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { PaymentStatus } from "@/lib/enums";
import { displayEmail } from "@/lib/guest";
import { cleanFreeText } from "@/lib/names";
import { recordAudit } from "@/server/audit";
import { notifyPaymentDecided } from "@/server/email/notify";
import type { Db } from "@/server/db/client";
import { paymentMethods, payments, statements, users } from "@/server/db/schema";
import type { Payment } from "./submit";

const asDb = (tx: unknown) => tx as Db;

const MIN_REASON_LENGTH = 3;
const MAX_REASON_LENGTH = 300;

/** Defence in depth: the server actions already require an admin; the domain checks again. */
function isActiveAdmin(db: Db, userId: string): boolean {
  const user = db.select({ role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, userId)).get();
  return user?.role === "ADMIN" && user.isActive;
}

const MIN_NOTE_LENGTH = 3;
const MAX_NOTE_LENGTH = 200;

export type ApproveResult =
  | { ok: true; changed: boolean; payment: Payment }
  | { ok: false; error: "FORBIDDEN" | "NOT_FOUND" | "NOT_PENDING" | "ADJUSTMENT_TOO_SHORT" | "ADJUSTMENT_TOO_LONG" }
  | { ok: false; error: "AMOUNT_MISMATCH"; expectedMinor: number; submittedMinor: number; currency: string };

/**
 * The admin confirms the money arrived in the receiving account. This is the only way a statement
 * becomes PAID. One immediate transaction: validate, mark the payment approved, settle the
 * statement, audit. Repeating it is harmless.
 *
 * A different amount needs an explicit adjustment note (the admin accepting it as full settlement);
 * partial payments and allocations are not supported yet.
 */
export function approvePayment(
  db: Db,
  args: { paymentId: string; adminId: string; adjustmentNote?: string | null; now?: Date },
): ApproveResult {
  const now = args.now ?? new Date();

  return db.transaction((tx): ApproveResult => {
    const t = asDb(tx);
    if (!isActiveAdmin(t, args.adminId)) return { ok: false, error: "FORBIDDEN" };

    const payment = t.select().from(payments).where(eq(payments.id, args.paymentId)).get();
    if (!payment) return { ok: false, error: "NOT_FOUND" };
    // Idempotent: a double-click or retry finds it already approved and changes nothing.
    if (payment.status === "APPROVED") return { ok: true, changed: false, payment };
    if (payment.status !== "PENDING") return { ok: false, error: "NOT_PENDING" };

    const statement = t.select().from(statements).where(eq(statements.id, payment.statementId)).get();
    if (!statement || statement.status !== "UNDER_VERIFICATION") return { ok: false, error: "NOT_PENDING" };

    const mismatch = payment.amountMinor !== statement.outstandingMinor;
    const note = (args.adjustmentNote ? cleanFreeText(args.adjustmentNote) : "") || null;
    if (mismatch && !note) {
      return {
        ok: false,
        error: "AMOUNT_MISMATCH",
        expectedMinor: statement.outstandingMinor,
        submittedMinor: payment.amountMinor,
        currency: statement.currency,
      };
    }
    // The note is the only record of why a different amount was accepted: it must be a real one.
    if (mismatch && note) {
      if (note.length < MIN_NOTE_LENGTH) return { ok: false, error: "ADJUSTMENT_TOO_SHORT" };
      if (note.length > MAX_NOTE_LENGTH) return { ok: false, error: "ADJUSTMENT_TOO_LONG" };
    }

    // The status check is repeated in the UPDATE so two admins can't both decide the same payment.
    const approved = t
      .update(payments)
      .set({ status: "APPROVED", reviewedBy: args.adminId, reviewedAt: now, adjustmentNote: mismatch ? note : null })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "PENDING")))
      .returning()
      .get();
    if (!approved) return { ok: false, error: "NOT_PENDING" };

    t.update(statements).set({ status: "PAID", outstandingMinor: 0 }).where(eq(statements.id, statement.id)).run();
    recordAudit(t, {
      actorId: args.adminId,
      action: "payment.approved",
      entityType: "payment",
      entityId: payment.id,
      metadata: {
        statementId: statement.id,
        reference: statement.reference,
        amountMinor: payment.amountMinor,
        expectedMinor: statement.outstandingMinor,
        adjustment: mismatch ? note : null,
      },
    });
    notifyPaymentDecided(t, { type: "PAYMENT_APPROVED", payment: approved, statement, now });
    return { ok: true, changed: true, payment: approved };
  }, { behavior: "immediate" });
}

export type DeclineResult =
  | { ok: true; changed: boolean; payment: Payment }
  | { ok: false; error: "FORBIDDEN" | "NOT_FOUND" | "NOT_PENDING" | "REASON_REQUIRED" | "REASON_TOO_LONG" };

/**
 * The admin could not confirm the money. The submission is kept as it was, the reason is recorded,
 * and the statement is payable again (overdue if its due day has passed) so the member can resubmit.
 */
export function declinePayment(
  db: Db,
  args: { paymentId: string; adminId: string; reason: string; now?: Date },
): DeclineResult {
  const now = args.now ?? new Date();
  const reason = cleanFreeText(args.reason);

  return db.transaction((tx): DeclineResult => {
    const t = asDb(tx);
    if (!isActiveAdmin(t, args.adminId)) return { ok: false, error: "FORBIDDEN" };

    const payment = t.select().from(payments).where(eq(payments.id, args.paymentId)).get();
    if (!payment) return { ok: false, error: "NOT_FOUND" };
    if (payment.status === "DECLINED") return { ok: true, changed: false, payment };
    if (payment.status !== "PENDING") return { ok: false, error: "NOT_PENDING" };
    if (reason.length < MIN_REASON_LENGTH) return { ok: false, error: "REASON_REQUIRED" };
    if (reason.length > MAX_REASON_LENGTH) return { ok: false, error: "REASON_TOO_LONG" };

    const statement = t.select().from(statements).where(eq(statements.id, payment.statementId)).get();
    if (!statement) return { ok: false, error: "NOT_FOUND" };
    // A pending payment implies UNDER_VERIFICATION; never silently reopen a statement that is something else.
    if (statement.status !== "UNDER_VERIFICATION") return { ok: false, error: "NOT_PENDING" };

    const declined = t
      .update(payments)
      .set({ status: "DECLINED", reviewedBy: args.adminId, reviewedAt: now, declineReason: reason })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "PENDING")))
      .returning()
      .get();
    if (!declined) return { ok: false, error: "NOT_PENDING" };

    t.update(statements)
      .set({ status: statement.dueAt.getTime() < now.getTime() ? "OVERDUE" : "UNPAID" })
      .where(eq(statements.id, statement.id))
      .run();
    recordAudit(t, {
      actorId: args.adminId,
      action: "payment.declined",
      entityType: "payment",
      entityId: payment.id,
      metadata: { statementId: statement.id, reference: statement.reference, reason },
    });
    notifyPaymentDecided(t, { type: "PAYMENT_DECLINED", payment: declined, statement, reason, now });
    return { ok: true, changed: true, payment: declined };
  }, { behavior: "immediate" });
}

export interface PreviousAttempt {
  id: string;
  status: PaymentStatus;
  declineReason: string | null;
  transactionRef: string;
  amountMinor: number;
}

export interface PendingPaymentRow {
  id: string;
  userId: string;
  memberName: string | null;
  memberEmail: string;
  statementId: string;
  statementReference: string;
  subscriptionName: string;
  /** "YYYY-MM" */
  period: string;
  /** Set when the statement is a share of an ambag bill. */
  billId: string | null;
  currency: string;
  /** What the statement still owes. */
  expectedMinor: number;
  /** What the member says they sent. */
  submittedMinor: number;
  amountMatches: boolean;
  destinationLabel: string;
  sendingApp: string;
  transactionRef: string;
  transactionDate: Date;
  submittedAt: Date;
  notes: string | null;
  /** Earlier declined reports for the same statement. */
  previousAttempts: PreviousAttempt[];
  /** This reference was declined before (possibly for another member): worth a closer look. */
  referenceSeenDeclined: boolean;
}

/** How many payments are waiting for the admin (the badge on the dock's Verify item). */
export function countPendingPayments(db: Db): number {
  return db.select({ n: count() }).from(payments).where(eq(payments.status, "PENDING")).get()?.n ?? 0;
}

/** The verification queue, oldest first. */
export function listPendingPayments(db: Db): PendingPaymentRow[] {
  const rows = db
    .select({ payment: payments, statement: statements, member: users, destinationLabel: paymentMethods.label })
    .from(payments)
    .innerJoin(statements, eq(statements.id, payments.statementId))
    .innerJoin(users, eq(users.id, payments.userId))
    .innerJoin(paymentMethods, eq(paymentMethods.id, payments.destinationMethodId))
    .where(eq(payments.status, "PENDING"))
    .orderBy(asc(payments.submittedAt))
    .all();

  return rows.map(({ payment, statement, member, destinationLabel }) => {
    const previousAttempts = db
      .select({
        id: payments.id,
        status: payments.status,
        declineReason: payments.declineReason,
        transactionRef: payments.transactionRef,
        amountMinor: payments.amountMinor,
      })
      .from(payments)
      .where(and(eq(payments.statementId, payment.statementId), eq(payments.status, "DECLINED")))
      .orderBy(asc(payments.submittedAt))
      .all();
    const referenceSeenDeclined = Boolean(
      db
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.transactionRefNorm, payment.transactionRefNorm), eq(payments.status, "DECLINED"), ne(payments.id, payment.id)))
        .get(),
    );
    return {
      id: payment.id,
      userId: payment.userId,
      memberName: member.name,
      memberEmail: displayEmail(member.email),
      statementId: statement.id,
      statementReference: statement.reference,
      subscriptionName: statement.subscriptionName,
      period: statement.period,
      billId: statement.billId,
      currency: statement.currency,
      expectedMinor: statement.outstandingMinor,
      submittedMinor: payment.amountMinor,
      amountMatches: payment.amountMinor === statement.outstandingMinor,
      destinationLabel,
      sendingApp: payment.sendingApp,
      transactionRef: payment.transactionRef,
      transactionDate: payment.transactionDate,
      submittedAt: payment.submittedAt,
      notes: payment.notes,
      previousAttempts,
      referenceSeenDeclined,
    };
  });
}

export interface ReviewedPaymentRow {
  id: string;
  status: PaymentStatus;
  memberName: string | null;
  memberEmail: string;
  reviewerName: string | null;
  declineReason: string | null;
  adjustmentNote: string | null;
  amountMinor: number;
  currency: string;
  period: string;
  subscriptionName: string;
  /** Set when the statement is a share of an ambag bill. */
  billId: string | null;
  transactionRef: string;
  reviewedAt: Date | null;
}

/** Verification history: decided payments, newest decision first. */
export function listReviewedPayments(db: Db, limit: number): ReviewedPaymentRow[] {
  const reviewer = alias(users, "reviewer");
  return db
    .select({
      id: payments.id,
      status: payments.status,
      memberName: users.name,
      memberEmail: users.email,
      reviewerName: reviewer.name,
      declineReason: payments.declineReason,
      adjustmentNote: payments.adjustmentNote,
      amountMinor: payments.amountMinor,
      currency: statements.currency,
      period: statements.period,
      subscriptionName: statements.subscriptionName,
      billId: statements.billId,
      transactionRef: payments.transactionRef,
      reviewedAt: payments.reviewedAt,
    })
    .from(payments)
    .innerJoin(statements, eq(statements.id, payments.statementId))
    .innerJoin(users, eq(users.id, payments.userId))
    .leftJoin(reviewer, eq(reviewer.id, payments.reviewedBy))
    .where(ne(payments.status, "PENDING"))
    .orderBy(desc(payments.reviewedAt))
    .limit(limit)
    .all()
    .map((row) => ({ ...row, memberEmail: displayEmail(row.memberEmail) }));
}
