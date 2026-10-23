import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { seedDefaultSubscription } from "@/server/subscriptions/service";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/** Opens a SQLite file (or ":memory:") with the pragmas this app relies on. */
export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  // Member emails, payment references and account numbers live in here: keep the file to its owner. SQLite gives the
  // write-ahead files the same permissions as the database file, so tightening it covers them too, and this also
  // fixes a file that an older version created world-readable. Best effort: a mount that cannot chmod still works.
  if (file !== ":memory:") {
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      /* not ours to change (some network or bind mounts): leave it */
    }
  }
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  return drizzle(sqlite, { schema });
}

export function migrateDb(db: Db, folder = MIGRATIONS_DIR): void {
  migrate(db, { migrationsFolder: folder });
}

const globalForDb = globalThis as unknown as { __ambaganDb?: Db };

/** Process-wide singleton (survives Next.js dev HMR). Migrates on first open. */
export function getDb(): Db {
  if (!globalForDb.__ambaganDb) {
    const db = openDb(process.env.DATABASE_PATH ?? "./data/ambagan.db");
    migrateDb(db);
    seedDefaultSubscription(db);
    globalForDb.__ambaganDb = db;
  }
  return globalForDb.__ambaganDb;
}

/** Folds the write-ahead log into the main file and closes the handle (graceful shutdown). */
export function closeDb(db: Db): void {
  db.$client.pragma("wal_checkpoint(TRUNCATE)");
  db.$client.close();
}

/** Closes the process-wide database if it was opened. */
export function closeSharedDb(): void {
  if (!globalForDb.__ambaganDb) return;
  closeDb(globalForDb.__ambaganDb);
  globalForDb.__ambaganDb = undefined;
}
