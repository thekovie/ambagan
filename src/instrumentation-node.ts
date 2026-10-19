import { getEnv } from "./env";
import { closeSharedDb, getDb } from "./server/db/client";
import { startScheduler } from "./server/jobs/scheduler";

// Fail fast: a missing secret, a bad SMTP setting or an unusable database must stop the process with a clear
// message (exit 1, so the container restarts and the logs say why), not leave a server that errors on every page.
try {
  getEnv();
  getDb(); // opens the database, applies migrations, seeds the default plan and payment methods
} catch (error) {
  console.error("ambagan could not start:", error instanceof Error ? error.message : error);
  process.exit(1);
}

// Next already drains in-flight requests on SIGTERM/SIGINT and then exits. Our part is only to leave the
// database tidy at that point (fold the WAL in): exit handlers must be synchronous, and so is this.
process.on("exit", () => {
  try {
    closeSharedDb();
  } catch {
    // Nothing useful to do while exiting; SQLite recovers the WAL on the next open anyway.
  }
});

startScheduler();
