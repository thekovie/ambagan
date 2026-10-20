import type { Db } from "@/server/db/client";
import type { createRateLimiter } from "@/server/auth/rate-limit";
import { verifyShareToken, type ShareAccess } from "./token";

export type CheckedShareAccess = Extract<ShareAccess, { ok: true }> | { ok: false; limited: boolean };

/**
 * Decides a private-link request. The signature is checked first (it is a pure HMAC, no database), and a link that
 * passes is NEVER limited: a valid link cannot be guessed, and many friends can share one address (mobile data,
 * an office), so limiting valid links could only lock real people out. Only bad links are counted against the caller's
 * address, and an address that keeps sending them is turned away, which just keeps junk traffic cheap.
 */
export function checkShareAccess(
  db: Db,
  args: { token: string; ip: string; limiter: ReturnType<typeof createRateLimiter>; now?: Date; secret?: string },
): CheckedShareAccess {
  const access = verifyShareToken(db, args.token, args.now, args.secret);
  if (access.ok) return access;

  const limited = args.limiter.isLimited(args.ip);
  if (!limited) args.limiter.hit(args.ip);
  return { ok: false, limited };
}
