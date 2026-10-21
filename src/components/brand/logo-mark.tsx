import { cn } from "@/lib/utils";

/**
 * The ambagan mark: a coin cut into four sticker slices, one lifted out as a friend takes their share.
 * The geometry lives here once; the app, the link-preview card and the icons all draw from it.
 */
export const LOGO_VIEWBOX = 28;
export const LOGO_STROKE = 1.3;

export interface LogoSlice {
  id: "share" | "right" | "left" | "top";
  /** A quarter of the coin, its apex nudged away from the centre so the slices have a gap. */
  d: string;
  /** Only the lifted slice moves: up and to the right, with a small tilt. */
  transform?: string;
}

export const LOGO_SLICES: readonly LogoSlice[] = [
  { id: "right", d: "M13.7 16.7H23.2A9.5 9.5 0 0 1 13.7 26.2Z" },
  { id: "left", d: "M11.3 16.7V26.2A9.5 9.5 0 0 1 1.8 16.7Z" },
  { id: "top", d: "M11.3 14.3H1.8A9.5 9.5 0 0 1 11.3 4.8Z" },
  { id: "share", d: "M12.5 15.5V6A9.5 9.5 0 0 1 22 15.5Z", transform: "translate(3.4 -3.4) rotate(6 12.5 15.5)" },
];

/** The same colours as the app's sticker pastels, as plain hex for the places that cannot read the theme (the preview card, the icons). */
export const LOGO_HEX = { share: "#f6b4bb", right: "#fbe89b", left: "#b7e8cf", top: "#a9d0f5", ink: "#3a1d36" } as const;

const FILL_CLASS: Record<LogoSlice["id"], string> = {
  share: "fill-st-rose",
  right: "fill-st-butter",
  left: "fill-st-mint",
  top: "fill-st-sky",
};

/** The mark for use inside the app: themed fills, so it follows light and dark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${LOGO_VIEWBOX} ${LOGO_VIEWBOX}`} className={cn("size-7 shrink-0", className)}>
      {LOGO_SLICES.map((slice) => (
        <path
          key={slice.id}
          d={slice.d}
          transform={slice.transform}
          className={cn(FILL_CLASS[slice.id], "stroke-st-ink")}
          strokeWidth={LOGO_STROKE}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
