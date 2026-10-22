import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SetupProgress } from "@/server/setup/progress";

/**
 * "Get set up": what a new admin does first, one thing at a time. Only the next step is opened up with its
 * explanation and button; finished steps are ticked and the rest are just named. It disappears once all are done.
 */
export function SetupChecklist({ progress }: { progress: SetupProgress }) {
  if (progress.complete) return null;
  const nextIndex = progress.steps.findIndex((step) => !step.done);

  return (
    <section aria-labelledby="setup" className="sheet flex max-w-2xl flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 id="setup" className="font-display text-title">
          Get set up
        </h2>
        <p className="text-sm text-muted-foreground">
          {progress.doneCount} of {progress.steps.length} done
        </p>
      </div>
      <ol className="flex flex-col gap-4">
        {progress.steps.map((step, index) => (
          <li key={step.id} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold",
                step.done ? "bg-st-mint text-st-ink" : index === nextIndex ? "bg-st-lilac text-st-ink" : "bg-muted text-muted-foreground",
              )}
            >
              {step.done ? <Check className="size-4" /> : index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-2">
              <p className={cn("font-bold", !step.done && index !== nextIndex && "text-muted-foreground")}>
                {step.title}
                <span className="sr-only">{step.done ? " (done)" : ""}</span>
              </p>
              {index === nextIndex ? (
                <>
                  <p className="text-sm text-muted-foreground">{step.hint}</p>
                  <div>
                    <Link href={step.href} className={cn(buttonVariants({ variant: "candy" }))}>
                      {step.cta} <ArrowRight data-icon="inline-end" />
                    </Link>
                  </div>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
