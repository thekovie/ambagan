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
});
