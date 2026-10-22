import { describe, expect, it } from "vitest";
import { clientIp } from "@/server/auth/client-ip";

const headers = (init: Record<string, string>) => new Headers(init);

describe("clientIp", () => {
  it("uses the entry appended by our proxy (the last one), not what the client typed first", () => {
    expect(clientIp(headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("works with a single forwarded address", () => {
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("ignores x-real-ip, which a client can set when the proxy does not overwrite it", () => {
    expect(clientIp(headers({ "x-real-ip": "6.6.6.6", "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("falls back to a shared bucket when no proxy header is present", () => {
    expect(clientIp(headers({}))).toBe("unknown");
  });

  it("treats every address in one IPv6 /64 as one client, so rotating inside a block gains nothing", () => {
    const a = clientIp(headers({ "x-forwarded-for": "2001:db8:1:2:aaaa:bbbb:cccc:dddd" }));
    const b = clientIp(headers({ "x-forwarded-for": "2001:db8:1:2:1111:2222:3333:4444" }));
    expect(a).toBe(b);
    expect(clientIp(headers({ "x-forwarded-for": "2001:db8:1:3::1" }))).not.toBe(a);
  });

  it("handles shortened and bracketed IPv6 forms and IPv4-mapped addresses", () => {
    expect(clientIp(headers({ "x-forwarded-for": "2001:db8::1" }))).toBe(clientIp(headers({ "x-forwarded-for": "2001:db8:0:0:ffff::9" })));
    expect(clientIp(headers({ "x-forwarded-for": "[2001:db8::1]" }))).toBe(clientIp(headers({ "x-forwarded-for": "2001:db8::2" })));
    expect(clientIp(headers({ "x-forwarded-for": "::ffff:203.0.113.9" }))).toBe("203.0.113.9");
  });
});
