import { Check, Hourglass, X } from "lucide-react";
import type { PaymentStatus } from "@/lib/enums";
import { cn } from "@/lib/utils";

// Reuses the statement pill colours: waiting = tangerine, approved = lime, declined = magenta.
const META: Record<PaymentStatus, { label: string; statementStatus: string; Icon: typeof Check }> = {
  PENDING: { label: "Waiting for check", statementStatus: "UNDER_VERIFICATION", Icon: Hourglass },
  APPROVED: { label: "Approved", statementStatus: "PAID", Icon: Check },
  DECLINED: { label: "Declined", statementStatus: "OVERDUE", Icon: X },
};

/** Status capsule for a payment report. Word + icon + colour, never colour alone. */
export function PaymentPill({ status, className }: { status: PaymentStatus; className?: string }) {
  const { label, statementStatus, Icon } = META[status];
  return (
    <span className={cn("pill", className)} data-status={statementStatus}>
      {label}
      <span className="pill-chip">
        <Icon className="size-3" strokeWidth={3} aria-hidden="true" />
      </span>
    </span>
  );
}
