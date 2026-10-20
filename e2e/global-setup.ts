import path from "node:path";
import { startSmtpSink } from "./smtp-sink";

const TMP = path.join(process.cwd(), "e2e", ".tmp");

/** Starts the local SMTP sink the app is configured to send through (see playwright.config.ts). */
export default async function globalSetup(): Promise<() => Promise<void>> {
  return startSmtpSink({
    port: 2465,
    mailDir: path.join(TMP, "mail"),
    keyFile: path.join(TMP, "key.pem"),
    certFile: path.join(TMP, "cert.pem"),
  });
}
