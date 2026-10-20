import { cn } from "@/lib/utils";

/** Lowercase wordmark with a tiny die-cut sticker glyph whose corner is peeled. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg aria-hidden="true" viewBox="0 0 28 28" className="size-7 shrink-0">
        <path
          d="M7 2h14a5 5 0 0 1 5 5v8l-9 11H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z"
          className="fill-st-rose stroke-[var(--sticker-edge)]"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path d="M26 15l-9 11v-6a5 5 0 0 1 5-5z" className="fill-[var(--sticker-back)]" />
        <path d="M10 10.5c1.2-2 4-1.4 4 .9 0-2.3 2.8-2.9 4-.9 1 1.8-1.2 3.8-4 6-2.8-2.2-5-4.2-4-6z" className="fill-st-ink" />
      </svg>
      <span className="font-display text-[1.5rem] leading-none">ambagan</span>
    </span>
  );
}
