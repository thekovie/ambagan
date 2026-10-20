import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { recordAudit } from "@/server/audit";
import { isActiveAdmin } from "@/server/bills/create";
import type { Db } from "@/server/db/client";
import { statements, users } from "@/server/db/schema";

type Statement = typeof statements.$inferSelect;
type User = typeof users.$inferSelect;

/** A link keeps working this long after the bill's due date (it is read-only once paid or cancelled). */
export const SHARE_LINK_GRACE_MS = 90 * 24 * 60 * 60 * 1000;
const MIN_SECRET_LENGTH = 32;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// One spelling per link: no leading zeros or signs, so "0", "00" and "+0" can never all open the same page.
const VERSION = /^(0|[1-9]\d{0,5})$/;
const TAG = /^[A-Za-z0-9_-]{43}$/; // base64url of a 32-byte HMAC-SHA256

/** The app's signing secret (validated at startup by the environment check). Share links die if it is rotated. */
export function shareSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) throw new Error("AUTH_SECRET (at least 32 characters) is needed to sign share links");
  return secret;
}

function sign(secret: string, statementId: string, version: number): string {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error("The signing secret is too short");
  // A purpose-specific key derived from the app secret, so the secret itself is never used directly to sign links.
  const key = Buffer.from(hkdfSync("sha256", secret, "", "ambagan/share-link/v1", 32));
  return createHmac("sha256", key).update(`share:v1:${statementId}:${version}`).digest("base64url");
}

/**
 * `statementId.version.signature`. Derived from the app secret rather than stored, so the admin can copy a link again
 * any time; replacing a link bumps the statement's `link_version`, which makes the old signature stop matching.
 */
export function shareToken(statement: Pick<Statement, "id" | "linkVersion">, secret: string = shareSecret()): string {
  return `${statement.id}.${statement.linkVersion}.${sign(secret, statement.id, statement.linkVersion)}`;
}

/** App-relative path of a statement's private link; joined to APP_URL when put in an email or copied. */
export function shareLinkPath(statement: Pick<Statement, "id" | "linkVersion">, secret?: string): string {
  return `/s/${shareToken(statement, secret)}`;
}

export type ShareAccess = { ok: true; statement: Statement; user: User } | { ok: false };

/**
 * Checks a private link. Every way of failing (malformed, forged, replaced, expired, wrong statement, not a bill
 * share, deactivated person) looks the same: `{ ok: false }`. The signature is compared in constant time and
 * checked before the database is touched, so guessing ids learns nothing and costs nothing.
 */
export function verifyShareToken(db: Db, token: string, now: Date = new Date(), secret: string = shareSecret()): ShareAccess {
  if (typeof token !== "string") return { ok: false };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false };
  const [statementId, versionText, tag] = parts;
  if (!UUID.test(statementId) || !VERSION.test(versionText) || !TAG.test(tag)) return { ok: false };

  const version = Number(versionText);
  const expected = Buffer.from(sign(secret, statementId, version));
  const given = Buffer.from(tag);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false };

  const row = db
    .select({ statement: statements, user: users })
    .from(statements)
    .innerJoin(users, eq(users.id, statements.userId))
    // Only a share of an ambag bill has a link; monthly statements are reached by signing in.
    .where(and(eq(statements.id, statementId), isNotNull(statements.billId)))
    .get();
  if (!row) return { ok: false };
  if (row.statement.linkVersion !== version) return { ok: false };
  if (now.getTime() > row.statement.dueAt.getTime() + SHARE_LINK_GRACE_MS) return { ok: false };
  if (!row.user.isActive) return { ok: false };
  return { ok: true, statement: row.statement, user: row.user };
}

export type RotateShareLinkResult = { ok: true; linkVersion: number } | { ok: false; error: "FORBIDDEN" | "NOT_FOUND" };

/** Replaces a person's link: the old URL stops working at once. Use it when a link went to the wrong chat. */
export function rotateShareLink(db: Db, input: { statementId: string; actorId: string }): RotateShareLinkResult {
  return db.transaction((tx): RotateShareLinkResult => {
    const t = tx as unknown as Db;
    if (!isActiveAdmin(t, input.actorId)) return { ok: false, error: "FORBIDDEN" };
    const current = t
      .select({ id: statements.id, linkVersion: statements.linkVersion })
      .from(statements)
      .where(and(eq(statements.id, input.statementId), isNotNull(statements.billId)))
      .get();
    if (!current) return { ok: false, error: "NOT_FOUND" };

    const linkVersion = current.linkVersion + 1;
    t.update(statements).set({ linkVersion }).where(eq(statements.id, current.id)).run();
    recordAudit(t, { actorId: input.actorId, action: "statement.link_replaced", entityType: "statement", entityId: current.id, metadata: { linkVersion } });
    return { ok: true, linkVersion };
  }, { behavior: "immediate" });
}
