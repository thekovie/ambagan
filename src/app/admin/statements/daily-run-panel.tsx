import { Check, Hourglass, TriangleAlert } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import type { JobRun } from "@/server/jobs/runner";
import { RECONCILE_HOUR_MANILA } from "@/server/jobs/schedule";
import { DailyRunButton } from "./daily-run-button";

// Reuses the statement pill colours: running = tangerine, succeeded = lime, failed = magenta.
const META = {
  RUNNING: { label: "Running", statementStatus: "UNDER_VERIFICATION", Icon: Hourglass },
  SUCCEEDED: { label: "Done", statementStatus: "PAID", Icon: Check },
  FAILED: { label: "Failed", statementStatus: "OVERDUE", Icon: TriangleAlert },
} as const;

function describeRun(run: JobRun): string {
  if (run.status === "FAILED") return run.error ?? "Failed";
  if (run.status === "RUNNING") return "In progress";
  const s = JSON.parse(run.summary) as { created?: number; markedOverdue?: number; queued?: number };
  return `Created ${s.created ?? 0}, marked ${s.markedOverdue ?? 0} overdue, queued ${s.queued ?? 0} email${s.queued === 1 ? "" : "s"}`;
}

/** The automatic daily run: when it happens, what the last runs did, and a manual trigger. */
export function DailyRunPanel({ runs }: { runs: JobRun[] }) {
  return (
    <section aria-labelledby="daily" className="sheet p-5 sm:p-6 flex max-w-2xl flex-col gap-4">
      <h2 id="daily" className="font-display text-title">
        Daily run
      </h2>
      <p className="text-muted-foreground">
        Every day at {RECONCILE_HOUR_MANILA}:00 Manila time ambagan issues statements that are due, marks late ones overdue
        and emails reminders (the day before, the day of, and weekly once overdue) to members who still owe. It never
        reminds anyone who has paid or is waiting on a check. If the app was off at that hour it catches up when it
        starts.
      </p>
      <DailyRunButton />
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">It hasn&apos;t run yet.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {runs.map((run) => {
            const { label, statementStatus, Icon } = META[run.status];
            return (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-semibold">
                    {formatDateTime(run.startedAt)}{" "}
                    <span className="font-normal text-muted-foreground">· {run.trigger === "MANUAL" ? "by hand" : "automatic"}</span>
                  </p>
                  <p className="text-muted-foreground">{describeRun(run)}</p>
                </div>
                <span className="pill" data-status={statementStatus}>
                  {label}
                  <span className="pill-chip">
                    <Icon className="size-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
