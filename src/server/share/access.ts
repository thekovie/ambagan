import "server-only";
import { headers } from "next/headers";
import { clientIp } from "@/server/auth/client-ip";
import { getDb } from "@/server/db/client";
import { checkShareAccess, type CheckedShareAccess } from "./check";
import { shareFailureLimiter } from "./limits";

export type RequiredShareAccess = CheckedShareAccess;

/**
 * The first thing every private-link page, action and route does. A valid link returns its statement and person.
 * Anything else returns `{ ok: false }`; callers answer every failure the same way (a plain "not found") so nothing
 * reveals why a link failed. See `checkShareAccess` for how bad attempts are counted.
 */
export async function requireShareAccess(token: string): Promise<RequiredShareAccess> {
  return checkShareAccess(getDb(), { token, ip: clientIp(await headers()), limiter: shareFailureLimiter });
}
