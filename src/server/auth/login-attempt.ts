import type { createRateLimiter } from "./rate-limit";

type Limiter = ReturnType<typeof createRateLimiter>;

export type LoginDecision =
  /** Go ahead and ask Auth.js for a sign-in link. */
  | "SEND"
  /** A link for this address went out in the last minute: say the usual "check your email" and send nothing more. */
  | "QUIET_SKIP"
  /** This one client is asking too often: tell them to wait. */
  | "TOO_MANY";

/**
 * Decides what to do with a request for a sign-in link. The limit per address is a short cooldown that never shows an
 * error, so nobody can use it to shut someone else out of signing in: while it is running, a link that works was
 * emailed to that address only seconds ago, and the person asking sees the same page as always. What actually stops
 * abuse is the per-client limit, which is checked first so an abuser cannot use up other people's cooldowns.
 */
export function decideLoginAttempt(
  email: string,
  ip: string,
  limiters: { email: Limiter; ip: Limiter },
): LoginDecision {
  if (!limiters.ip.hit(ip).allowed) return "TOO_MANY";
  return limiters.email.hit(email).allowed ? "SEND" : "QUIET_SKIP";
}
