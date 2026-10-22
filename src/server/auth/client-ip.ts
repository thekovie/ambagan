/**
 * Client address for rate limiting, behind exactly one trusted reverse proxy.
 * Proxies append to X-Forwarded-For, so the LAST entry is the one our proxy saw;
 * earlier entries (and X-Real-IP unless the proxy overwrites it) are client-controlled.
 * Requests with no header share one "unknown" bucket.
 */
export function clientIp(headers: Pick<Headers, "get">): string {
  const last = headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  return last ? limiterKey(last) : "unknown";
}

/**
 * What counts as "one client" for rate limiting. An IPv4 address is itself. A home or mobile connection gets a whole
 * IPv6 /64 block (billions of addresses) to itself, so every address in a block is one client: otherwise one person
 * could rotate through addresses to dodge a limit or to push other people's counters out of the table.
 */
function limiterKey(raw: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(raw);
  const ip = (bracketed ? bracketed[1] : raw).split("%")[0];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!ip.includes(":")) return ip;

  const halves = ip.split("::");
  if (halves.length > 2) return ip;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const groups = [...head, ...Array<string>(Math.max(fill, 0)).fill("0"), ...tail];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return ip;
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}
