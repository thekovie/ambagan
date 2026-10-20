import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { statements } from "@/server/db/schema";
import { shareLinkPath } from "./token";

/**
 * Queued emails never contain a private link (it is a credential, and the database and its backups would then hold
 * working links). They carry only `shareLink: "1"`; the link is made here, when the message is sent, from the
 * statement's current version. So replacing a link also fixes anything still queued, and a resend uses the live one.
 */
export function resolveShareLink<T extends { path?: string; shareLink?: string }>(
  db: Db,
  payload: T,
  statementId: string | null,
  secret?: string,
): T {
  if (!payload.shareLink || !statementId) return payload;
  const statement = db.select({ id: statements.id, linkVersion: statements.linkVersion }).from(statements).where(eq(statements.id, statementId)).get();
  if (!statement) return payload;
  return { ...payload, path: shareLinkPath(statement, secret) };
}
