import { and, eq, ne } from "drizzle-orm";
import { recordAudit } from "@/server/audit";
import { notifyDuplicateAttempt, notifyPaymentSubmitted } from "@/server/email/notify";
import type { Db } from "@/server/db/client";
import { paymentMethods, payments, statements } from "@/server/db/schema";
import { normalizeReference, type PaymentInput } from "./form";

export type Payment = typeof payments.$inferSelect;

export type SubmitResult =
  | {
      ok: true;
      payment: Payment;
      /** False when the member reported a different amount than is outstanding. */
      amountMatches: boolean;
    }
  | { ok: false; error: "NOT_FOUND" | "NOT_PAYABLE" | "INVALID_DESTINATION" | "DUPLICATE_REFERENCE" };

const asDb = (tx: unknown) => tx as Db;

/**
 * A member reports a payment they made outside the app. This only records the claim: nothing is
 * marked paid until an administrator verifies it against the receiving account.
 *
 * One immediate transaction covers the checks and the writes, and the database's partial unique
 * indexes back the rules up (one pending payment per statement, a reference only in use once).
 */
export function submitPayment(db: Db, args: { userId: string; input: PaymentInput; now?: Date }): SubmitResult {
  const { userId, input } = args;
  const now = args.now ?? new Date();

  return db.transaction((tx): SubmitResult => {
    const t = asDb(tx);
    // Ownership is part of the query: someone else's statement is simply "not found".
    const statement = t
      .select()
      .from(statements)
      .where(and(eq(statements.id, input.statementId), eq(statements.userId, userId)))
      .get();
    if (!statement) return { ok: false, error: "NOT_FOUND" };
    if (statement.status !== "UNPAID" && statement.status !== "OVERDUE") return { ok: false, error: "NOT_PAYABLE" };

    const destination = t
      .select({ id: paymentMethods.id, label: paymentMethods.label })
      .from(paymentMethods)
      .where(and(eq(paymentMethods.id, input.destinationMethodId), eq(paymentMethods.isActive, true)))
      .get();
    if (!destination) return { ok: false, error: "INVALID_DESTINATION" };

    const transactionRefNorm = normalizeReference(input.transactionRef);
    const inUse = t
      .select()
      .from(payments)
      .where(and(eq(payments.transactionRefNorm, transactionRefNorm), ne(payments.status, "DECLINED")))
      .get();
    if (inUse) {
      // First reporter wins, so a member reporting someone else's receipt would otherwise look like its owner. Tell the
      // admins (once per pair) and keep a record. Written here, not rolled back: the refusal below commits it.
      if (inUse.userId !== userId) {
        recordAudit(t, {
          actorId: userId,
          action: "payment.duplicate_reference_blocked",
          entityType: "payment",
          entityId: inUse.id,
          metadata: { statementId: statement.id, existingPaymentId: inUse.id },
        });
        notifyDuplicateAttempt(t, { existing: inUse, attemptedBy: userId, statement, transactionRef: input.transactionRef, now });
      }
      return { ok: false, error: "DUPLICATE_REFERENCE" };
    }

    const payment = t
      .insert(payments)
      .values({
        statementId: statement.id,
        userId,
        destinationMethodId: destination.id,
        sendingApp: input.sendingApp,
        amountMinor: input.amountMinor,
        transactionRef: input.transactionRef,
        transactionRefNorm,
        transactionDate: input.transactionDate,
        notes: input.notes,
        submittedAt: now,
      })
      .returning()
      .get();

    // The balance is untouched: it only drops when the admin approves.
    t.update(statements).set({ status: "UNDER_VERIFICATION" }).where(eq(statements.id, statement.id)).run();
    recordAudit(t, {
      actorId: userId,
      action: "payment.submitted",
      entityType: "payment",
      entityId: payment.id,
      metadata: { statementId: statement.id, reference: statement.reference, amountMinor: input.amountMinor },
    });
    // Written in this transaction: if it rolls back there is no email, and an SMTP outage can never undo a payment report.
    notifyPaymentSubmitted(t, { payment, statement, destinationLabel: destination.label, now });
    return { ok: true, payment, amountMatches: input.amountMinor === statement.outstandingMinor };
  }, { behavior: "immediate" });
}
