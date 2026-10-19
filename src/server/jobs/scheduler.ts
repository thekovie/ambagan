import { runEmailQueue } from "@/server/email/worker";
import { runDailyJob } from "./daily";
import { shouldRunDaily } from "./schedule";

const TICK_MS = 60_000;
const FIRST_TICK_MS = 15_000;

declare global {
  var __ambaganScheduler: NodeJS.Timeout | undefined;
}

let ticking = false;

/** One pass: the daily job if it is due (the runner makes it once a day), then any email that is due or retrying. */
async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const now = new Date();
    if (shouldRunDaily(now)) await runDailyJob("SCHEDULED", now);
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
