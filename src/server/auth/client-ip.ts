/**
 * Client address for rate limiting, behind exactly one trusted reverse proxy.
 * Proxies append to X-Forwarded-For, so the LAST entry is the one our proxy saw;
 * earlier entries (and X-Real-IP unless the proxy overwrites it) are client-controlled.
 * Requests with no header share one "unknown" bucket.
 */
export function clientIp(headers: Pick<Headers, "get">): string {
  const last = headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  return last || "unknown";
}
