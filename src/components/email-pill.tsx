import { Ban, Check, Hourglass, Send, TriangleAlert } from "lucide-react";
import type { EmailStatus } from "@/lib/enums";
import { cn } from "@/lib/utils";

// SENT means the mail server accepted it. Nothing here claims delivery: SMTP can't tell us that.
const META: Record<EmailStatus, { label: string; statementStatus: string; Icon: typeof Check }> = {
  PENDING: { label: "Waiting to send", statementStatus: "UNDER_VERIFICATION", Icon: Hourglass },
  SENDING: { label: "Sending", statementStatus: "UNDER_VERIFICATION", Icon: Send },
  SENT: { label: "Sent", statementStatus: "PAID", Icon: Check },
  FAILED: { label: "Failed", statementStatus: "OVERDUE", Icon: TriangleAlert },
  // Not sent on purpose (the statement was paid meanwhile, the member was deactivated): neutral, not an error.
  SKIPPED: { label: "Skipped", statementStatus: "CANCELLED", Icon: Ban },
};

/** Status capsule for a queued email. Word + icon + colour, never colour alone. */
export function EmailPill({ status, className }: { status: EmailStatus; className?: string }) {
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
