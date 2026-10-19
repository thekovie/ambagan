import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/** Opens a SQLite file (or ":memory:") with the pragmas this app relies on. */
export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
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
    globalForDb.__ambaganDb = db;
  }
  return globalForDb.__ambaganDb;
}
