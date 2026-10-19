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
});
