import { LOGO_SLICES, LOGO_STROKE, LOGO_VIEWBOX, type LogoSlice } from "@/components/brand/logo-mark";
import { cn } from "@/lib/utils";

const FILL_CLASS: Record<LogoSlice["id"], string> = {
  share: "fill-st-rose",
  right: "fill-st-butter",
  left: "fill-st-mint",
  top: "fill-st-sky",
};

/**
 * The preloader: the ambagan coin, its slices popping in turn (the lifted one hops). Each path sits in a group so the
 * animation never fights the slice's own tilt. With reduced motion it simply stays still.
 */
export function CoinLoader({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn("flex flex-col items-center gap-3", className)}>
      <svg aria-hidden="true" viewBox={`0 0 ${LOGO_VIEWBOX} ${LOGO_VIEWBOX}`} className="coin-loader size-16 overflow-visible">
        {LOGO_SLICES.map((slice) => (
          <g key={slice.id} className="coin-slice" data-slice={slice.id}>
            <path d={slice.d} transform={slice.transform} className={cn(FILL_CLASS[slice.id], "stroke-st-ink")} strokeWidth={LOGO_STROKE} strokeLinejoin="round" />
          </g>
        ))}
      </svg>
      <p className="font-display text-base font-bold text-muted-foreground">{label}</p>
    </div>
  );
}
