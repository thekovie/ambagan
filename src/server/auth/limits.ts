import "server-only";
import { createRateLimiter } from "./rate-limit";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * Sign-in link requests. Per address it is a one-minute cooldown (see `decideLoginAttempt`): it keeps a friend's inbox
 * from filling up, but is never shown as an error, because anyone who knows an address could otherwise use a visible
 * limit to lock that person out. Per client IP it is a real limit.
 */
export const loginEmailLimiter = createRateLimiter({ limit: 1, windowMs: 60 * 1000 });
export const loginIpLimiter = createRateLimiter({ limit: 20, windowMs: FIFTEEN_MINUTES });
/** Bad or used-up invitation links, per client. Counting only these keeps people who share an address (an office, a phone network) from blocking each other. */
export const inviteIpLimiter = createRateLimiter({ limit: 20, windowMs: FIFTEEN_MINUTES });
