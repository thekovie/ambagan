import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env";

// Built here rather than written out, so no secret-shaped literal sits in the repository (and nothing for a scanner to flag).
const randomLooking = (seed: number) => Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 37 + seed * 101 + 11) % 251)).toString("base64");

const base = {
  DATABASE_PATH: "./data/ambagan.db",
  AUTH_SECRET: randomLooking(1),
  APP_URL: "http://localhost:3000",
  ADMIN_EMAIL: "admin@example.com",
};

describe("parseEnv", () => {
  it("accepts a minimal development environment without SMTP", () => {
    const env = parseEnv({ ...base, NODE_ENV: "development" });
    expect(env.smtp).toBeNull();
  });

  it("rejects a short AUTH_SECRET", () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });

  it("requires SMTP settings in production", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production" })).toThrow(/SMTP_HOST/);
  });

  it("parses SMTP settings when provided", () => {
    const env = parseEnv({
      ...base,
      NODE_ENV: "production",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_SECURE: "false",
      SMTP_USER: "u",
      SMTP_PASSWORD: "p",
      SMTP_FROM_EMAIL: "from@example.com",
    });
    expect(env.smtp).toMatchObject({ host: "smtp.example.com", port: 587, secure: false });
  });

  it("keeps 14 backups by default and rejects nonsense", () => {
    expect(parseEnv({ ...base }).BACKUP_KEEP).toBe(14);
    expect(parseEnv({ ...base, BACKUP_KEEP: "30" }).BACKUP_KEEP).toBe(30);
    expect(() => parseEnv({ ...base, BACKUP_KEEP: "0" })).toThrow(/BACKUP_KEEP/);
    expect(() => parseEnv({ ...base, BACKUP_KEEP: "many" })).toThrow(/BACKUP_KEEP/);
  });

  describe("AUTH_SECRET in production", () => {
    const prod = { ...base, NODE_ENV: "production", SMTP_HOST: "smtp.example.com", SMTP_FROM_EMAIL: "from@example.com", APP_URL: "https://pay.example.com" };
    it("refuses obviously weak or documented placeholder secrets, since share links are derived from it", () => {
      for (const weak of ["x".repeat(40), "ci-only-secret-ci-only-secret-ci-only", "e2e-secret-e2e-secret-e2e-secret-12", "dev-secret-dev-secret-dev-secret-12", "changeme-changeme-changeme-changeme"]) {
        expect(() => parseEnv({ ...prod, AUTH_SECRET: weak }), weak).toThrow(/AUTH_SECRET[\s\S]*openssl rand -base64 32/);
      }
    });
    it("accepts a random one, and does not nag in development", () => {
      expect(parseEnv({ ...prod, AUTH_SECRET: randomLooking(2) }).AUTH_SECRET).toHaveLength(44);
      // A quick local try-out may use anything long enough.
      expect(parseEnv({ ...base, NODE_ENV: "development", AUTH_SECRET: "x".repeat(32) }).AUTH_SECRET).toBe("x".repeat(32));
    });
  });

  describe("APP_URL in production", () => {
    const prod = { ...base, NODE_ENV: "production", SMTP_HOST: "smtp.example.com", SMTP_FROM_EMAIL: "from@example.com" };
    it("must be https (links and secure cookies depend on it)", () => {
      expect(() => parseEnv({ ...prod, APP_URL: "http://pay.example.com" })).toThrow(/https/);
      expect(parseEnv({ ...prod, APP_URL: "https://pay.example.com" }).APP_URL).toBe("https://pay.example.com");
    });
    it("may be plain http for localhost (trying it out, smoke tests)", () => {
      expect(parseEnv({ ...prod, APP_URL: "http://localhost:3000" }).APP_URL).toBe("http://localhost:3000");
      expect(parseEnv({ ...prod, APP_URL: "http://127.0.0.1:3000" }).APP_URL).toBe("http://127.0.0.1:3000");
    });
    it("is not restricted in development", () => {
      expect(parseEnv({ ...base, NODE_ENV: "development", APP_URL: "http://pay.example.com" }).APP_URL).toBe("http://pay.example.com");
    });
  });
});
