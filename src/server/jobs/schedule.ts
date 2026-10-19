/** Name under which the daily run is recorded in `job_run`. */
export const DAILY_JOB = "daily-reconcile";
/** Name under which the daily backup is recorded in `job_run`. */
export const BACKUP_JOB = "daily-backup";

/** The daily run starts at the first tick on or after this hour, Manila time. */
export const RECONCILE_HOUR_MANILA = 8;

const MANILA_UTC_OFFSET_HOURS = 8; // no daylight saving

/**
 * True once it is `RECONCILE_HOUR_MANILA` or later in Manila. It stays true for the rest of the day on purpose:
 * if the app was down at 08:00 the first tick after it comes back still runs the job (the runner makes
 * sure that happens only once per day).
 */
export function shouldRunDaily(now: Date): boolean {
  return (now.getUTCHours() + MANILA_UTC_OFFSET_HOURS) % 24 >= RECONCILE_HOUR_MANILA;
}
