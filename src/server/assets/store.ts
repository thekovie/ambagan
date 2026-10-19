import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getEnv } from "@/env";

// The directory is chosen at runtime (ASSETS_DIR), so file tracing is opted out on purpose: the paths
// are not part of the build and tracing them would pull the whole project into the output.

/** Where uploaded admin images live: a persistent directory, never `public/` (access goes through an authorised route). */
export const assetsDir = (): string => path.resolve(/*turbopackIgnore: true*/ getEnv().ASSETS_DIR);

/** Payment QR screenshots are small; this also stays under the 2 MB Server Action body limit. */
export const MAX_IMAGE_BYTES = 1_500_000;

export interface ImageType {
  mime: "image/png" | "image/jpeg" | "image/webp";
  ext: "png" | "jpg" | "webp";
}

// Names are generated here only: 32 lowercase hex characters plus a known extension.
const FILE_PATTERN = /^[a-f0-9]{32}\.(png|jpg|webp)$/;

/**
 * Identifies an image by its signature, never by the client's claimed type or filename.
 * SVG is deliberately unsupported: it can carry script.
 */
export function sniffImage(bytes: Uint8Array): ImageType | null {
  const at = (signature: number[], offset = 0) => signature.every((b, i) => bytes[offset + i] === b);
  if (bytes.length >= 8 && at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (bytes.length >= 3 && at([0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.length >= 12 && at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8)) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export type SaveResult =
  | { ok: true; file: string; mime: ImageType["mime"] }
  | { ok: false; error: "EMPTY" | "TOO_LARGE" | "UNSUPPORTED_TYPE" | "WRITE_FAILED" };

/** Validates and stores an image under a random name, readable only by the app's user. */
export function saveImage(dir: string, bytes: Uint8Array): SaveResult {
  if (bytes.length === 0) return { ok: false, error: "EMPTY" };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "TOO_LARGE" };
  const type = sniffImage(bytes);
  if (!type) return { ok: false, error: "UNSUPPORTED_TYPE" };

  const file = `${randomBytes(16).toString("hex")}.${type.ext}`;
  const target = path.join(/*turbopackIgnore: true*/ dir, file);
  try {
    // Owner-only directory and file; "wx" never overwrites an existing file.
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    // e.g. disk full: don't leave a truncated file behind.
    fs.rmSync(target, { force: true });
    console.error("Could not store uploaded image", error instanceof Error ? error.message : error);
    return { ok: false, error: "WRITE_FAILED" };
  }
  return { ok: true, file, mime: type.mime };
}

/** Returns the bytes, or null for a bad name or a missing file. The name check blocks path traversal. */
export function readImage(dir: string, file: string): Buffer | null {
  if (!FILE_PATTERN.test(file)) return null;
  try {
    return fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, file));
  } catch {
    return null;
  }
}

/** Silent no-op for names this module did not generate. */
export function deleteImage(dir: string, file: string): void {
  if (!FILE_PATTERN.test(file)) return;
  fs.rmSync(path.join(/*turbopackIgnore: true*/ dir, file), { force: true });
}
