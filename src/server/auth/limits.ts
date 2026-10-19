import "server-only";
import { createRateLimiter } from "./rate-limit";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/** Sign-in link requests: per address (stops mail bombing a friend) and per client IP. */
export const loginEmailLimiter = createRateLimiter({ limit: 5, windowMs: FIFTEEN_MINUTES });
export const loginIpLimiter = createRateLimiter({ limit: 20, windowMs: FIFTEEN_MINUTES });
