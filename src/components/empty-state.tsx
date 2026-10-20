import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

/** An empty sticker slot: a dashed outline where a sticker will go. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-[var(--radius-sticker)] border-2 border-dashed border-input px-6 py-10 text-center",
        className,
      )}
    >
      <div className="grid size-12 place-items-center rounded-full bg-st-lilac text-st-ink [&_svg]:size-5">{icon}</div>
      <h2 className="font-display text-2xl">{title}</h2>
      <p className="max-w-[38ch] text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
