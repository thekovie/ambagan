import { cn } from "@/lib/utils";
import { LogoMark } from "./logo-mark";

/** Lowercase wordmark beside the mark: a coin cut into sticker slices, one lifted out. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-display text-[1.5rem] leading-none">ambagan</span>
    </span>
  );
}
