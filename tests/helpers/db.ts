import { migrateDb, openDb, type Db } from "@/server/db/client";

/** Fresh in-memory database with all migrations applied. */
export function createTestDb(): Db {
  const db = openDb(":memory:");
  migrateDb(db);
  return db;
}
