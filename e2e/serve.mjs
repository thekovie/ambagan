// Starts the app exactly as the Docker image does: the standalone server, with the static files, public assets and
// migrations laid out beside it. (`next start` doesn't support `output: "standalone"`.) The Playwright webServer runs
// this after `pnpm build`.
import { spawn } from "node:child_process";
import { cpSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
cpSync(path.join(root, "drizzle"), path.join(standalone, "drizzle"), { recursive: true });

const child = spawn(process.execPath, ["server.js"], {
  cwd: standalone,
  stdio: "inherit",
  env: { ...process.env, PORT: "3100", HOSTNAME: "127.0.0.1" },
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
