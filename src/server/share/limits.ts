import "server-only";
import { createRateLimiter } from "@/server/auth/rate-limit";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * Bad private-link attempts per client address. A link's signature cannot be guessed, so this is not what protects
 * it: it only keeps one address from filling the logs with junk. Valid links are never counted or limited (see
 * `checkShareAccess`), so a shared address can never lock a real friend out.
 */
export const shareFailureLimiter = createRateLimiter({ limit: 30, windowMs: FIFTEEN_MINUTES });
