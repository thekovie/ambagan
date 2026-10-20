import { lt } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { sessions, verificationTokens } from "@/server/db/schema";

/**
 * Removes sessions and sign-in links that have expired. Auth.js leaves them behind, and it stores a link for every
 * address typed on the login page (including unknown ones), so without this the table slowly accumulates addresses
 * that were never members. Returns how many rows were removed.
 */
export function pruneExpiredAuth(db: Db, now: Date): number {
  const expiredSessions = db.delete(sessions).where(lt(sessions.expires, now)).run().changes;
  const expiredLinks = db.delete(verificationTokens).where(lt(verificationTokens.expires, now)).run().changes;
  return expiredSessions + expiredLinks;
}
