import { and, desc, eq, gt, gte, lt, lte, ne } from "drizzle-orm";
import { manilaDateKey } from "@/server/billing/period";
import type { Db } from "@/server/db/client";
import { jobRuns } from "@/server/db/schema";

/** A run still marked RUNNING after this long is presumed to have crashed and no longer blocks new runs. */
export const STALE_RUN_MS = 30 * 60_000;
/** After a scheduled run fails, wait this long before the next tick tries again (not every minute all day). */
export const FAILED_RETRY_MS = 30 * 60_000;
const MAX_ERROR_LENGTH = 500;

type Trigger = "SCHEDULED" | "MANUAL";

export type JobResult<T> =
  | { ran: true; summary: T }
  | { ran: true; error: string }
  | { ran: false; reason: "ALREADY_RAN_TODAY" | "ALREADY_RUNNING" | "RECENTLY_FAILED" };

const asDb = (tx: unknown) => tx as Db;

/** Decides whether this run may start, and records it as RUNNING, in one immediate transaction. */
function claim(db: Db, job: string, trigger: Trigger, now: Date): { runId: string } | { reason: "ALREADY_RAN_TODAY" | "ALREADY_RUNNING" | "RECENTLY_FAILED" } {
  return db.transaction((tx) => {
    const t = asDb(tx);
    const staleBefore = new Date(now.getTime() - STALE_RUN_MS);

    if (t.select({ id: jobRuns.id }).from(jobRuns).where(and(eq(jobRuns.job, job), eq(jobRuns.status, "RUNNING"), gt(jobRuns.startedAt, staleBefore))).get()) {
      return { reason: "ALREADY_RUNNING" as const };
    }
    if (trigger === "SCHEDULED") {
      const startOfDay = new Date(`${manilaDateKey(now)}T00:00:00+08:00`);
      const done = t.select({ id: jobRuns.id }).from(jobRuns).where(and(eq(jobRuns.job, job), eq(jobRuns.status, "SUCCEEDED"), gte(jobRuns.startedAt, startOfDay))).get();
      if (done) return { reason: "ALREADY_RAN_TODAY" as const };
      const failedBefore = new Date(now.getTime() - FAILED_RETRY_MS);
      const failed = t.select({ id: jobRuns.id }).from(jobRuns).where(and(eq(jobRuns.job, job), eq(jobRuns.status, "FAILED"), gt(jobRuns.startedAt, failedBefore))).get();
      if (failed) return { reason: "RECENTLY_FAILED" as const };
    }
    // Whatever is still RUNNING at this point crashed: record it as such so the history is honest.
    t.update(jobRuns)
      .set({ status: "FAILED", error: "Interrupted: the process stopped before this run finished", finishedAt: now })
      .where(and(eq(jobRuns.job, job), eq(jobRuns.status, "RUNNING"), lte(jobRuns.startedAt, staleBefore)))
      .run();
    const run = t.insert(jobRuns).values({ job, trigger, status: "RUNNING", startedAt: now }).returning({ id: jobRuns.id }).get();
    return { runId: run.id };
  }, { behavior: "immediate" });
}

/**
 * Runs `fn` and records it in `job_run`. A scheduled run happens at most once per Manila day (a failed one can be
 * retried the same day); a manual run always may, but never alongside another run of the same job.
 * Failures are recorded, not thrown: the scheduler must keep ticking.
 */
export async function runJob<T extends Record<string, unknown>>(
  db: Db,
  job: string,
  trigger: Trigger,
  fn: () => Promise<T> | T,
  now: Date = new Date(),
): Promise<JobResult<T>> {
  const claimed = claim(db, job, trigger, now);
  if ("reason" in claimed) return { ran: false, reason: claimed.reason };

  try {
    const summary = await fn();
    db.update(jobRuns)
      .set({ status: "SUCCEEDED", finishedAt: new Date(), summary: JSON.stringify(summary) })
      .where(eq(jobRuns.id, claimed.runId))
      .run();
    return { ran: true, summary };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH);
    console.error(`Job ${job} failed`, message);
    db.update(jobRuns).set({ status: "FAILED", finishedAt: new Date(), error: message }).where(eq(jobRuns.id, claimed.runId)).run();
    return { ran: true, error: message };
  }
}

export type JobRun = typeof jobRuns.$inferSelect;

/** Most recent runs of a job, newest first. */
export function listJobRuns(db: Db, job: string, limit: number): JobRun[] {
  return db.select().from(jobRuns).where(eq(jobRuns.job, job)).orderBy(desc(jobRuns.startedAt)).limit(limit).all();
}

/** Retention: finished runs older than `olderThanDays` are removed. Returns how many. */
export function pruneJobRuns(db: Db, now: Date, olderThanDays: number): number {
  const cutoff = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000);
  return db.delete(jobRuns).where(and(ne(jobRuns.status, "RUNNING"), lt(jobRuns.startedAt, cutoff))).run().changes;
}
