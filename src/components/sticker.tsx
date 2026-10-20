import type { ReactNode } from "react";
import { StatusPill } from "@/components/status-pill";
import type { StatementStatus } from "@/lib/enums";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface StickerProps {
  status: StatementStatus;
  subscriptionName: string;
  /** e.g. "October 2026" */
  periodLabel: string;
  amountMinor: number;
  currency: string;
  /** e.g. "Due Sat, Oct 10" or "Paid Oct 8" */
  dateLabel: string;
  reference: string;
  /** Set once, right after approval, to play the peel. */
  justPaid?: boolean;
  compact?: boolean;
  /** Action row (buttons/links) rendered at the bottom of the sticker. */
  children?: ReactNode;
  className?: string;
}

/**
 * A statement as a pastel die-cut sticker. Its edge repeats the status shown by the pill, so colour is never the
 * only signal: unpaid is whole, under verification is half peeled, paid is peeled with a sparkle, overdue has a
 * label tab sticking out, cancelled is an empty dashed slot.
 */
export function Sticker({
  status,
  subscriptionName,
  periodLabel,
  amountMinor,
  currency,
  dateLabel,
  reference,
  justPaid,
  compact,
  children,
  className,
}: StickerProps) {
  return (
    <article
      className={cn("sticker", className)}
      data-status={status}
      data-just-paid={justPaid ? "" : undefined}
      aria-label={`${subscriptionName} statement for ${periodLabel}`}
    >
      <span className="sticker-tab" aria-hidden="true" />
      <div className={cn("sticker-face", compact ? "px-5 py-5" : "px-6 pb-8 pt-7 sm:px-8")}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <p className="min-w-0 text-sm font-bold">
            {subscriptionName} · {periodLabel}
          </p>
          <StatusPill status={status} />
        </div>
        <p
          className={cn(
            "sticker-amount font-display mt-2",
            compact ? "text-4xl" : "text-[clamp(2.75rem,12vw,4.5rem)]",
          )}
        >
          {formatMinor(amountMinor, currency)}
        </p>
        <p className="mt-2 text-sm font-semibold">
          {dateLabel}
          <span className="mx-2 opacity-60" aria-hidden="true">
            /
          </span>
          <span className="font-mono text-[0.8rem] tracking-tight">{reference}</span>
        </p>
        {/* Keep actions clear of the peeled corner. */}
        {children ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 pr-[calc(var(--peel)*0.8)]">{children}</div>
        ) : null}
      </div>
      <span className="sticker-flap" aria-hidden="true" />
      <svg className="sticker-sparkle" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2c.6 5.4 4.6 9.4 10 10-5.4.6-9.4 4.6-10 10-.6-5.4-4.6-9.4-10-10 5.4-.6 9.4-4.6 10-10z" />
      </svg>
    </article>
  );
}
