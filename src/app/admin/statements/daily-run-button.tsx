"use client";

import { Play } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { runDailyJobAction, type DailyRunState } from "./actions";

/** Runs the daily job by hand. The job is idempotent, so pressing it twice only repeats the checks. */
export function DailyRunButton() {
  const [state, action, pending] = useActionState<DailyRunState>(runDailyJobAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <Button type="submit" variant="secondary" disabled={pending}>
        <Play data-icon="inline-start" />
        {pending ? "Running…" : "Run it now"}
      </Button>
      {/* Always mounted, so screen readers announce the text when it appears. */}
      <div aria-live="polite" className="empty:hidden">
        {state.error ? <p className="text-sm font-semibold text-destructive">{state.error}</p> : null}
        {state.message ? <p className="text-sm font-semibold">{state.message}</p> : null}
      </div>
    </form>
  );
}
