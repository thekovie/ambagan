import { ChevronDown } from "lucide-react";
import { formatMinor } from "@/lib/money";
import type { SplitMethod } from "@/lib/split";
import type { ShareView } from "@/server/bills";

const HOW: Record<SplitMethod, string> = {
  EQUAL: "split equally",
  SHARES: "split by shares",
  PERCENT: "split by percentage",
  EXACT: "split by set amounts",
  ITEMS: "split by what each person had",
};

/**
 * "How this was split": the bill, the total and one person's own lines. It only ever receives that person's slice
 * (see `getShareForStatement`), so it cannot show anyone else's name or amount.
 */
export function ShareBreakdown({ share, currency, collapsed = false }: { share: ShareView; currency: string; collapsed?: boolean }) {
  // One line that is the whole share (an equal split, say) needs no "Your share" total under it: it would say the same thing twice.
  const onlyLine = share.lines.length === 1 && share.lines[0].amountMinor === share.amountMinor;
  const body = (
    <>
      {share.note ? <p className="whitespace-pre-line">{share.note}</p> : null}
      <p className="text-muted-foreground">
        {formatMinor(share.totalMinor, currency)} in total, {HOW[share.method]} between {share.participantCount}{" "}
        {share.participantCount === 1 ? "person" : "people"}.
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {share.lines.map((line, index) => (
          <li key={index} className="flex items-baseline justify-between gap-4 py-2">
            <span>
              <span className="font-semibold">{line.label}</span>
              {line.note ? <span className="block text-sm text-muted-foreground">{line.note}</span> : null}
            </span>
            <span className="font-bold">
              {line.amountMinor < 0 ? "−" : ""}
              {formatMinor(Math.abs(line.amountMinor), currency)}
            </span>
          </li>
        ))}
        {onlyLine ? null : (
          <li className="flex items-baseline justify-between gap-4 pt-3 text-lg font-bold">
            <span>Your share</span>
            <span>{formatMinor(share.amountMinor, currency)}</span>
          </li>
        )}
      </ul>
    </>
  );

  // Someone who just wants to pay sees the answer first and can open how it was worked out.
  if (collapsed) {
    return (
      <details className="sheet group">
        <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-5 py-3 sm:px-6">
          <h2 id="split" className="font-display text-title">
            How this was split
          </h2>
          <ChevronDown className="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="flex flex-col gap-3 px-5 pb-5 sm:px-6 sm:pb-6">{body}</div>
      </details>
    );
  }
  return (
    <section aria-labelledby="split" className="sheet flex flex-col gap-3 p-5 sm:p-6">
      <h2 id="split" className="font-display text-title">
        How this was split
      </h2>
      {body}
    </section>
  );
}
