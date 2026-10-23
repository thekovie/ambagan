import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS } from "./steps";

/**
 * Where you are in the wizard. Finished steps are buttons, so a mistake in an earlier step is one tap away; the steps
 * ahead are shown but not pressable, because each one builds on the last.
 */
export function Stepper({ current, onGo }: { current: number; onGo: (step: number) => void }) {
  return (
    <nav aria-label="Progress">
      <ol className="flex gap-2">
        {STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={step.label} className="min-w-0 flex-1">
              <button
                type="button"
                disabled={index > current}
                aria-current={active ? "step" : undefined}
                onClick={() => onGo(index)}
                className={cn(
                  "flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 px-2 text-sm font-bold transition-colors outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active && "border-transparent bg-st-lilac text-st-ink",
                  done && "border-transparent bg-st-mint text-st-ink",
                  !active && !done && "border-input text-muted-foreground",
                )}
              >
                <span aria-hidden="true" className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold", active || done ? "bg-white/70 text-st-ink" : "bg-muted text-foreground")}>
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span className="truncate">
                  {step.label}
                  <span className="sr-only">{done ? " (done)" : active ? " (current step)" : ""}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
