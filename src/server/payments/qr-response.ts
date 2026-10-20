import "server-only";
import { assetsDir, readImage } from "@/server/assets/store";

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "payment";

/**
 * The response for a payment QR image once the caller has been authorised (by session or by private link).
 * Stored names are random per upload, so the name is a perfect validator: a replaced or removed QR can never be
 * served from a stale cache, yet an unchanged one costs only a 304.
 */
export function qrResponse(request: Request, qr: { file: string; mime: string; label: string }): Response {
  const bytes = readImage(assetsDir(), qr.file);
  if (!bytes) return new Response("Not found", { status: 404 });

  const etag = `"${qr.file}"`;
  const headers = {
    ETag: etag,
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
    // The image never needs scripts, styles or framing, even if opened directly.
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = `${slug(qr.label)}-qr.${EXTENSIONS[qr.mime] ?? "png"}`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      ...headers,
      "Content-Type": qr.mime,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    },
  });
}
