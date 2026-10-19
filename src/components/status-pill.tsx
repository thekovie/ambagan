import { AlertTriangle, Ban, Check, CircleDashed, Hourglass } from "lucide-react";
import type { StatementStatus } from "@/lib/enums";
import { STATUS_META, type StatusIcon } from "@/lib/status";
import { cn } from "@/lib/utils";

const ICONS: Record<StatusIcon, typeof Check> = {
  "circle-dashed": CircleDashed,
  hourglass: Hourglass,
  check: Check,
  "alert-triangle": AlertTriangle,
  ban: Ban,
};

/** Capsule with the status word and an icon chip: colour is never the only signal. */
export function StatusPill({ status, className }: { status: StatementStatus; className?: string }) {
  const { label, icon } = STATUS_META[status];
  const Icon = ICONS[icon];
  return (
    <span className={cn("pill", className)} data-status={status}>
      {label}
      <span className="pill-chip">
        <Icon className="size-3" strokeWidth={3} aria-hidden="true" />
      </span>
    </span>
  );
}
