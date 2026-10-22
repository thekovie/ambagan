import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("next.config headers", () => {
  it("does not advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("treats /s/ links and /invite/ links as secret URLs: same-origin referrer, no indexing, no caching", async () => {
    const rules = await nextConfig.headers!();
    for (const source of ["/s/:path*", "/invite/:path*"]) {
      const rule = rules.find((r) => r.source === source);
      expect(rule, source).toBeDefined();
      const headers = Object.fromEntries(rule!.headers.map((h) => [h.key, h.value]));
      expect(headers["Referrer-Policy"]).toBe("same-origin");
      expect(headers["X-Robots-Tag"]).toMatch(/noindex/);
      expect(headers["Cache-Control"]).toBe("private, no-store");
    }
  });

  it("keeps the framing and sniffing protections on everything", async () => {
    const rules = await nextConfig.headers!();
    const all = Object.fromEntries(rules.find((r) => r.source === "/:path*")!.headers.map((h) => [h.key, h.value]));
    expect(all["X-Frame-Options"]).toBe("DENY");
    expect(all["X-Content-Type-Options"]).toBe("nosniff");
  });
});
