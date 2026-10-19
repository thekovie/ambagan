import { runBackupJob } from "@/server/backup/run";
import { runEmailQueue } from "@/server/email/worker";
import { runDailyJob } from "./daily";
import { shouldRunDaily } from "./schedule";

const TICK_MS = 60_000;
const FIRST_TICK_MS = 15_000;

declare global {
  var __ambaganScheduler: NodeJS.Timeout | undefined;
}

let ticking = false;

/**
 * One pass: the daily backup, then the daily job (each at most once a day, enforced by the runner), then any email
 * that is due or retrying. The backup goes first so there is a snapshot from before the day's changes (a hand-started
 * backup earlier the same day counts as that snapshot).
 */
async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const now = new Date();
    if (shouldRunDaily(now)) {
      await runBackupJob("SCHEDULED", now);
      await runDailyJob("SCHEDULED", now);
    }
    await runEmailQueue();
  } catch (error) {
    console.error("Scheduler tick failed", error instanceof Error ? error.message : error);
  } finally {
    ticking = false;
  }
}

/**
 * Starts the in-process scheduler: no cron, no second container. Safe to call more than once (dev reloads),
 * and it never keeps the process alive on its own.
 */
export function startScheduler(): void {
  if (globalThis.__ambaganScheduler) return;
  const first = setTimeout(() => void tick(), FIRST_TICK_MS);
  first.unref();
  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref();
  globalThis.__ambaganScheduler = timer;
}
