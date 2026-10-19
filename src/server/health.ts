import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";

export interface Health {
  ok: boolean;
  database: "ok" | "unavailable";
}

/**
 * What the container health check asks: can we read the database, and does it have our schema? Deliberately
 * terse: the endpoint is unauthenticated, so it never says why something failed.
 */
export function checkHealth(db: Db): Health {
  try {
    db.get(sql`SELECT 1 FROM "user" LIMIT 1`);
    return { ok: true, database: "ok" };
  } catch {
    return { ok: false, database: "unavailable" };
  }
}
