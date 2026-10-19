import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteImage, MAX_IMAGE_BYTES, readImage, saveImage, sniffImage } from "@/server/assets/store";

// Synthetic headers: just enough bytes for the signature checks, never real images.
const png = (extra = 8) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(extra, 1)]);
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16, 2)]);
const webp = () => Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(16, 3)]);

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ambagan-assets-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("sniffImage", () => {
  it("identifies PNG, JPEG and WebP by their signature, ignoring any claimed type", () => {
    expect(sniffImage(png())).toEqual({ mime: "image/png", ext: "png" });
    expect(sniffImage(jpeg())).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(sniffImage(webp())).toEqual({ mime: "image/webp", ext: "webp" });
  });

  it("rejects SVG (can carry script), PDF, HTML, plain text and truncated input", () => {
    for (const bad of ['<svg xmlns="http://www.w3.org/2000/svg"></svg>', "%PDF-1.7", "<html></html>", "hello", ""]) {
      expect(sniffImage(Buffer.from(bad))).toBeNull();
    }
    expect(sniffImage(Buffer.from([0x89, 0x50]))).toBeNull();
  });

  it("does not accept a RIFF container that is not WebP", () => {
    expect(sniffImage(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(8)]))).toBeNull();
  });
});

describe("saveImage / readImage / deleteImage", () => {
  it("stores the bytes under a random server-chosen name with the right extension", () => {
    const bytes = png(64);
    const res = saveImage(dir, bytes);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.file).toMatch(/^[a-f0-9]{32}\.png$/);
    expect(res.mime).toBe("image/png");
    expect(fs.readdirSync(dir)).toEqual([res.file]);
    expect(readImage(dir, res.file)?.equals(bytes)).toBe(true);
  });

  it("creates the directory when it doesn't exist yet", () => {
    const nested = path.join(dir, "a", "b");
    expect(saveImage(nested, jpeg()).ok).toBe(true);
    expect(fs.readdirSync(nested)).toHaveLength(1);
  });

  it("gives every upload its own name", () => {
    const a = saveImage(dir, png());
    const b = saveImage(dir, png());
    expect(a.ok && b.ok && a.file !== b.file).toBe(true);
  });

  it("refuses empty, oversized and unsupported uploads and writes nothing", () => {
    expect(saveImage(dir, Buffer.alloc(0))).toEqual({ ok: false, error: "EMPTY" });
    expect(saveImage(dir, Buffer.concat([png(), Buffer.alloc(MAX_IMAGE_BYTES)]))).toEqual({ ok: false, error: "TOO_LARGE" });
    expect(saveImage(dir, Buffer.from("<svg></svg>"))).toEqual({ ok: false, error: "UNSUPPORTED_TYPE" });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("only touches files that match the generated name pattern (no path traversal)", () => {
    const outside = path.join(dir, "..", `outside-${Date.now()}.png`);
    fs.writeFileSync(outside, png());
    try {
      for (const evil of ["../" + path.basename(outside), "..\\x.png", "/etc/passwd", "a.png", "", "x".repeat(32) + ".png", "A".repeat(32) + ".png"]) {
        expect(readImage(dir, evil)).toBeNull();
        deleteImage(dir, evil); // must be a silent no-op
      }
      expect(fs.existsSync(outside)).toBe(true);
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  it("deletes a stored file, and a second delete is harmless", () => {
    const res = saveImage(dir, png());
    if (!res.ok) throw new Error("setup");
    deleteImage(dir, res.file);
    expect(readImage(dir, res.file)).toBeNull();
    expect(() => deleteImage(dir, res.file)).not.toThrow();
  });
});
