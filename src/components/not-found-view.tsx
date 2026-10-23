import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { buttonVariants } from "@/components/ui/button";
import { LOGO_SLICES, LOGO_STROKE, LOGO_VIEWBOX, type LogoSlice } from "@/components/brand/logo-mark";
import { cn } from "@/lib/utils";

const FILL_CLASS: Record<LogoSlice["id"], string> = {
  share: "fill-st-rose",
  right: "fill-st-butter",
  left: "fill-st-mint",
  top: "fill-st-sky",
};

/** The coin with its lifted slice carried well away from the others: the slice that "went missing". */
const WANDERED = "translate(11 -10) rotate(24 12.5 15.5)";

/**
 * The 404: shown for any address that doesn't exist, and also for ones a person isn't allowed to see (a member
 * opening an admin page, a wrong private link), so it reveals nothing. `inShell` drops the full-page frame because the
 * header and dock are already there.
 */
export function NotFoundView({ inShell = false }: { inShell?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center gap-8 text-center", inShell ? "py-12" : "min-h-dvh justify-center px-6 py-12")}>
      {inShell ? null : <Wordmark />}
      <svg aria-hidden="true" viewBox={`0 0 ${LOGO_VIEWBOX} ${LOGO_VIEWBOX}`} className="not-found-coin size-40 overflow-visible">
        {/* A dashed outline where the slice used to sit. */}
        <path d="M13.7 14.3V4.8A9.5 9.5 0 0 1 23.2 14.3Z" fill="none" strokeDasharray="1.6 1.6" strokeWidth={0.9} className="stroke-muted-foreground/60" />
        {LOGO_SLICES.map((slice) => (
          <g key={slice.id} className={slice.id === "share" ? "not-found-wanderer" : undefined}>
            <path
              d={slice.d}
              transform={slice.id === "share" ? WANDERED : undefined}
              className={cn(FILL_CLASS[slice.id], "stroke-st-ink")}
              strokeWidth={LOGO_STROKE}
              strokeLinejoin="round"
            />
          </g>
        ))}
      </svg>
      <div className="flex max-w-md flex-col gap-3">
        <p className="font-display text-title text-muted-foreground">404</p>
        <h1 className="font-display text-display">That slice went missing</h1>
        <p className="text-muted-foreground">We couldn&apos;t find that page. The link may be old or mistyped, or it may not be yours to see.</p>
      </div>
      <Link href="/" className={buttonVariants({ variant: "candy", size: "lg" })}>
        Take me home
      </Link>
    </div>
  );
}
