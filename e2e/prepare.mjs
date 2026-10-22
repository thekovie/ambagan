// Runs before the app is built and started for the end-to-end test: a clean scratch folder (fresh database, no
// leftover mail or uploads) and a throwaway self-signed certificate for the local SMTP sink.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const tmp = path.join(process.cwd(), "e2e", ".tmp");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(path.join(tmp, "mail"), { recursive: true });

execFileSync(
  "openssl",
  ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(tmp, "key.pem"), "-out", path.join(tmp, "cert.pem"), "-days", "2", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"],
  { stdio: "ignore" },
);
