import { createHash, randomBytes } from "node:crypto";

/** 256-bit URL-safe random token (43 chars). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is persisted; the raw token lives in the emailed link. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
