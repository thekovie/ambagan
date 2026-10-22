import { randomBytes } from "node:crypto";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

process.env.E2E_AUTH_SECRET ??= randomBytes(32).toString("base64");

const PORT = 3100;
const SMTP_PORT = 2465;
const BASE_URL = `http://localhost:${PORT}`;
const TMP = path.join(process.cwd(), "e2e", ".tmp");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // One user journey that builds on itself (invite, sign in, pay, verify), so tests run in order, one at a time.
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: BASE_URL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  // The full Chromium build (new headless mode), the closest thing to what people use.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chromium" } }],
  // The real production build, run the way the Docker image runs it (standalone server), so the strict CSP, the
  // native SQLite module in the traced bundle and nodemailer over TLS are all exercised. Port 3100 is set in e2e/serve.mjs.
  webServer: {
    command: "node e2e/prepare.mjs && pnpm build && node e2e/serve.mjs",
    url: `${BASE_URL}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      ...(process.env as Record<string, string>),
      APP_URL: BASE_URL,
      // Random per run (set before Playwright starts its workers, so they all agree): production start-up refuses placeholder secrets.
      AUTH_SECRET: process.env.E2E_AUTH_SECRET,
      ADMIN_EMAIL: "admin@e2e.test",
      DATABASE_PATH: path.join(TMP, "ambagan.db"),
      ASSETS_DIR: path.join(TMP, "assets"),
      BACKUP_DIR: path.join(TMP, "backups"),
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(SMTP_PORT),
      SMTP_SECURE: "true",
      SMTP_FROM_EMAIL: "noreply@e2e.test",
      // The sink's certificate is self-signed: trust exactly that one (it names 127.0.0.1), rather than switching off TLS checks.
      NODE_EXTRA_CA_CERTS: path.join(TMP, "cert.pem"),
    },
  },
});
