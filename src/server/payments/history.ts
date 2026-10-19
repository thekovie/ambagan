import { desc, eq } from "drizzle-orm";
import type { PaymentStatus } from "@/lib/enums";
import type { Db } from "@/server/db/client";
import { paymentMethods, payments, statements } from "@/server/db/schema";

export interface PaymentHistoryRow {
  id: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  transactionRef: string;
  sendingApp: string;
  destinationLabel: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  declineReason: string | null;
  statementId: string;
  statementReference: string;
  /** "YYYY-MM" of the statement this payment was for. */
  period: string;
  subscriptionName: string;
}

/** A member's own payment reports, newest first. Declined ones are kept: nothing is ever overwritten. */
export function listPaymentsForUser(db: Db, userId: string): PaymentHistoryRow[] {
  return db
    .select({
      id: payments.id,
      status: payments.status,
      amountMinor: payments.amountMinor,
      currency: statements.currency,
      transactionRef: payments.transactionRef,
      sendingApp: payments.sendingApp,
      destinationLabel: paymentMethods.label,
      submittedAt: payments.submittedAt,
      reviewedAt: payments.reviewedAt,
      declineReason: payments.declineReason,
      statementId: statements.id,
      statementReference: statements.reference,
      period: statements.period,
      subscriptionName: statements.subscriptionName,
    })
    .from(payments)
    .innerJoin(statements, eq(statements.id, payments.statementId))
    .innerJoin(paymentMethods, eq(paymentMethods.id, payments.destinationMethodId))
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.submittedAt))
    .all();
}
