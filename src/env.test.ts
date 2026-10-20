import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env";

const base = {
  DATABASE_PATH: "./data/ambagan.db",
  AUTH_SECRET: "x".repeat(32),
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
