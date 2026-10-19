import { cn } from "@/lib/utils";

/** Lowercase wordmark with a tiny sachet glyph (crimp-free, perforated, notched). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg aria-hidden="true" viewBox="0 0 28 20" className="h-5 w-7 shrink-0">
        <rect x="1" y="1" width="26" height="18" rx="3.5" className="fill-foil-magenta" />
        <path d="M18 3v14" strokeWidth="1.6" strokeDasharray="2 2.4" className="stroke-on-foil-magenta" />
        <circle cx="18" cy="1" r="2.4" className="fill-background" />
        <circle cx="18" cy="19" r="2.4" className="fill-background" />
      </svg>
      <span className="font-display text-[1.6rem] leading-none">ambagan</span>
    </span>
  );
}
