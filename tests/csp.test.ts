import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/csp";

const directive = (csp: string, name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `) || d === name);

describe("buildCsp", () => {
  const csp = buildCsp({ nonce: "abc123", isDev: false, isHttps: true });

  it("only runs scripts that carry this request's nonce, and never allows inline script", () => {
    const script = directive(csp, "script-src")!;
    expect(script).toContain("'nonce-abc123'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("lets the in-browser OCR engine run (WebAssembly and a worker) without opening scripts up", () => {
    expect(directive(csp, "script-src")).toContain("'wasm-unsafe-eval'");
    expect(directive(csp, "worker-src")).toBe("worker-src 'self' blob:");
  });

  it("never loads anything from another origin", () => {
    expect(csp).not.toMatch(/https?:\/\//);
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(directive(csp, "font-src")).toBe("font-src 'self'");
  });

  it("blocks framing, plugins and base-tag tricks, and keeps forms on our origin", () => {
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
  });

  it("only forces https upgrades when the app is served over https", () => {
    expect(csp).toContain("upgrade-insecure-requests");
    expect(buildCsp({ nonce: "n", isDev: false, isHttps: false })).not.toContain("upgrade-insecure-requests");
  });

  it("allows eval in development only (React's dev tooling needs it)", () => {
    expect(directive(buildCsp({ nonce: "n", isDev: true, isHttps: false }), "script-src")).toContain("'unsafe-eval'");
  });

  it("uses a different nonce each time it is given one", () => {
    expect(buildCsp({ nonce: "one", isDev: false, isHttps: true })).not.toBe(buildCsp({ nonce: "two", isDev: false, isHttps: true }));
  });
});
