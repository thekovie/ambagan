import type { SachetProps } from "@/components/sachet";
import { formatDate } from "@/lib/dates";
import type { StatementStatus } from "@/lib/enums";
import { periodLabel, periodStub } from "@/server/billing/period";

/** The fields of a statement row that the display layer needs. */
export interface StatementLike {
  reference: string;
  /** "YYYY-MM" */
  period: string;
  status: StatementStatus;
  subscriptionName: string;
  amountMinor: number;
  currency: string;
  dueAt: Date;
  cancelledAt: Date | null;
}

/** What the strip's date line says for each status. */
export function statementDateLabel(st: Pick<StatementLike, "status" | "dueAt" | "cancelledAt">): string {
  switch (st.status) {
    case "UNPAID":
      return `Due ${formatDate(st.dueAt)}`;
    case "OVERDUE":
      return `Was due ${formatDate(st.dueAt)}`;
    case "UNDER_VERIFICATION":
      return "Awaiting verification";
    case "PAID":
      return "Settled";
    case "CANCELLED":
      return st.cancelledAt ? `Cancelled ${formatDate(st.cancelledAt)}` : "Cancelled";
  }
}

export type StatementSachetProps = Pick<
  SachetProps,
  "status" | "subscriptionName" | "periodLabel" | "stubLabel" | "amountMinor" | "currency" | "dateLabel" | "reference"
>;

/**
 * The status to show. The daily job persists OVERDUE, but a statement whose due day has
 * ended must never read "Unpaid" just because the job hasn't run yet.
 */
export function effectiveStatus(st: Pick<StatementLike, "status" | "dueAt">, now = new Date()): StatementStatus {
  return st.status === "UNPAID" && st.dueAt.getTime() < now.getTime() ? "OVERDUE" : st.status;
}

export function sachetProps(st: StatementLike, now = new Date()): StatementSachetProps {
  const status = effectiveStatus(st, now);
  return {
    status,
    subscriptionName: st.subscriptionName,
    periodLabel: periodLabel(st.period),
    stubLabel: periodStub(st.period),
    amountMinor: st.amountMinor,
    currency: st.currency,
    dateLabel: statementDateLabel({ ...st, status }),
    reference: st.reference,
  };
}
