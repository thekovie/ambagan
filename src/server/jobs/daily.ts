import "server-only";
import { getDb } from "@/server/db/client";
import { kickEmailQueue } from "@/server/email/worker";
import { reconcile, type ReconcileSummary } from "./reconcile";
import { runJob, type JobResult } from "./runner";
import { DAILY_JOB } from "./schedule";

/**
 * Runs the daily reconcile through the job runner (idempotent per Manila day when scheduled), then sends the
 * emails it queued. Used by the scheduler tick and by the admin "Run now" button.
 */
export async function runDailyJob(trigger: "SCHEDULED" | "MANUAL", now: Date = new Date()): Promise<JobResult<ReconcileSummary>> {
  const db = getDb();
  const result = await runJob(db, DAILY_JOB, trigger, () => reconcile(db, now), now);
  if (result.ran) kickEmailQueue();
  return result;
}
