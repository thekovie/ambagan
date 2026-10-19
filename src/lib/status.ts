import type { StatementStatus } from "@/lib/enums";

export type StatusIcon = "circle-dashed" | "hourglass" | "check" | "alert-triangle" | "ban";

/** Every status carries a word and an icon: colour is never the only signal. */
export const STATUS_META: Record<StatementStatus, { label: string; icon: StatusIcon }> = {
  UNPAID: { label: "Unpaid", icon: "circle-dashed" },
  UNDER_VERIFICATION: { label: "Under verification", icon: "hourglass" },
  PAID: { label: "Paid", icon: "check" },
  OVERDUE: { label: "Overdue", icon: "alert-triangle" },
  CANCELLED: { label: "Cancelled", icon: "ban" },
};

export type StatusAction = { kind: "submit" | "view-submission" | "view-payment" | "view"; label: string };

export function statusAction(status: StatementStatus): StatusAction {
  switch (status) {
    case "UNPAID":
    case "OVERDUE":
      return { kind: "submit", label: "Submit payment" };
    case "UNDER_VERIFICATION":
      return { kind: "view-submission", label: "View submission" };
    case "PAID":
      return { kind: "view-payment", label: "View payment details" };
    case "CANCELLED":
      return { kind: "view", label: "View statement" };
  }
}
