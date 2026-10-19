import type { ReactNode } from "react";
import { StatusPill } from "@/components/status-pill";
import type { StatementStatus } from "@/lib/enums";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface SachetProps {
  status: StatementStatus;
  subscriptionName: string;
  /** e.g. "October 2026" */
  periodLabel: string;
  /** Three-letter month printed on the tear-off stub, e.g. "OCT" */
  stubLabel: string;
  amountMinor: number;
  currency: string;
  /** e.g. "Due Sat, Oct 10" or "Paid Oct 8" */
  dateLabel: string;
  reference: string;
  /** Set once, right after approval, to play the settle animation. */
  justPaid?: boolean;
  compact?: boolean;
  /** Draws a punched hang-hole; place hung sachets inside a `.rack`. */
  hung?: boolean;
  /** Action row (buttons/links) rendered at the bottom of the strip. */
  children?: ReactNode;
  className?: string;
}

/**
 * A statement as a tingi sachet: foil strip, crimped seal, perforated stub.
 * The stub's state (attached, half torn, gone) and the corner/edge treatment
 * repeat the status shown by the pill, so colour is never the only signal.
 */
export function Sachet({
  status,
  subscriptionName,
  periodLabel,
  stubLabel,
  amountMinor,
  currency,
  dateLabel,
  reference,
  justPaid,
  compact,
  hung,
  children,
  className,
}: SachetProps) {
  return (
    <article
      className={cn("sachet", className)}
      data-status={status}
      data-just-paid={justPaid ? "" : undefined}
      aria-label={`${subscriptionName} statement for ${periodLabel}`}
    >
      <div className={cn("sachet-body", compact ? "px-4 py-7" : "px-5 pb-9 pt-9 sm:px-8")}>
        <span className="sachet-crease" aria-hidden="true" />
        <span className="sachet-perf" aria-hidden="true" />
        {hung ? <span className="sachet-hole" aria-hidden="true" /> : null}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <p className="min-w-0 text-sm font-bold">
            {subscriptionName} · {periodLabel}
          </p>
          <StatusPill status={status} />
        </div>
        <p
          className={cn(
            "sachet-amount font-display mt-3",
            compact ? "text-5xl" : "text-[clamp(3.75rem,19vw,6rem)]",
          )}
        >
          {formatMinor(amountMinor, currency)}
        </p>
        <p className="mt-3 text-sm font-semibold">
          {dateLabel}
          <span className="mx-2 opacity-60" aria-hidden="true">
            /
          </span>
          <span className="font-mono text-[0.8rem] tracking-tight">{reference}</span>
        </p>
        {children ? <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div> : null}
      </div>
      <div className="sachet-stub grid place-items-center" aria-hidden="true">
        <span className="font-display rotate-180 text-3xl [writing-mode:vertical-rl]">{stubLabel}</span>
      </div>
    </article>
  );
}
