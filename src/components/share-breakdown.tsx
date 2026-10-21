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
export function ShareBreakdown({ share, currency }: { share: ShareView; currency: string }) {
  return (
    <section aria-labelledby="split" className="sheet flex flex-col gap-3 p-5 sm:p-6">
      <h2 id="split" className="font-display text-title">
        How this was split
      </h2>
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
        <li className="flex items-baseline justify-between gap-4 pt-3 text-lg font-bold">
          <span>Your share</span>
          <span>{formatMinor(share.amountMinor, currency)}</span>
        </li>
      </ul>
    </section>
  );
}
