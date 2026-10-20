import { desc, eq } from "drizzle-orm";
import type { PaymentStatus, StatementStatus } from "@/lib/enums";
import { effectiveStatus } from "@/lib/statement-view";
import { shareOf, type ShareView } from "@/server/bills";
import type { Db } from "@/server/db/client";
import { bills, payments, statements, users } from "@/server/db/schema";
import { listPaymentMethods } from "@/server/payments/methods";

type Statement = typeof statements.$inferSelect;
type User = typeof users.$inferSelect;

export interface ShareMethod {
  id: string;
  label: string;
  accountName: string | null;
  accountNumber: string | null;
  instructions: string | null;
  hasQr: boolean;
}

export interface ShareLinkView {
  statement: Statement;
  /** What the person sees: an unpaid statement past its due day reads as overdue. */
  status: StatementStatus;
  /** Only this person's slice of the bill: never anyone else's name, amount or id. */
  share: ShareView;
  /** True while a payment can still be reported (unpaid or overdue). */
  payable: boolean;
  /** Where they can send the money: only the accounts switched on. */
  methods: ShareMethod[];
  /** Their most recent report, so the page can say "waiting for the admin" or why it was declined. */
  latestPayment: { status: PaymentStatus; declineReason: string | null; submittedAt: Date } | null;
}

/** Everything a private-link page needs for one statement. The caller has already verified the link. */
export function getShareLinkView(db: Db, access: { statement: Statement; user: User }, now = new Date()): ShareLinkView {
  const { statement } = access;
  const bill = db.select().from(bills).where(eq(bills.id, statement.billId ?? "")).get();
  const share = bill ? shareOf(bill, statement.userId) : null;
  if (!share) throw new Error("A share link was opened for a statement that is not part of a bill");

  const status = effectiveStatus(statement, now);
  const latest = db
    .select({ status: payments.status, declineReason: payments.declineReason, submittedAt: payments.submittedAt })
    .from(payments)
    .where(eq(payments.statementId, statement.id))
    .orderBy(desc(payments.submittedAt), desc(payments.id))
    .get();

  return {
    statement,
    status,
    share,
    payable: status === "UNPAID" || status === "OVERDUE",
    methods: listPaymentMethods(db, { activeOnly: true }).map((m) => ({
      id: m.id,
      label: m.label,
      accountName: m.accountName,
      accountNumber: m.accountNumber,
      instructions: m.instructions,
      hasQr: Boolean(m.qrFile),
    })),
    latestPayment: latest ?? null,
  };
}
