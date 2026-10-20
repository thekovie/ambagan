import path from "node:path";
import Database from "better-sqlite3";

const DB_FILE = path.join(process.cwd(), "e2e", ".tmp", "ambagan.db");

/** The current Asia/Manila billing month, "YYYY-MM". */
export function manilaPeriodNow(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(new Date());
}

/**
 * Test-only: makes a member's billing start this month, as if they had joined earlier in it.
 *
 * Why it is needed: a member who joins after their plan's due day (the 10th) is deliberately first billed next
 * month, so on most days of the month a member invited by this test has nothing to pay yet. The app has no
 * back-dating feature, so the test states the precondition directly in its scratch database.
 */
export function startBillingThisMonth(email: string): void {
  const db = new Database(DB_FILE);
  try {
    db.pragma("busy_timeout = 5000");
    const changed = db
      .prepare("UPDATE membership SET start_period = ? WHERE user_id = (SELECT id FROM user WHERE email = ?)")
      .run(manilaPeriodNow(), email).changes;
    if (changed !== 1) throw new Error(`Expected to update one membership for ${email}, updated ${changed}`);
  } finally {
    db.close();
  }
}
