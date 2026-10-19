import { getSessionUser } from "@/server/auth/session";
import { assetsDir, readImage } from "@/server/assets/store";
import { getDb } from "@/server/db/client";
import { getQrForViewer } from "@/server/payments/methods";

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "payment";

/**
 * Serves a payment method's QR image. Images are not in `public/`: every request is checked,
 * so signed-out visitors and deactivated users get nothing, and members only get active methods.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const qr = getQrForViewer(getDb(), user, id);
  const bytes = qr ? readImage(assetsDir(), qr.file) : null;
  if (!qr || !bytes) return new Response("Not found", { status: 404 });

  // Stored names are random per upload, so the name is a perfect validator: a replaced or removed QR
  // can never be served from a stale cache, yet an unchanged one costs only a 304 (after the auth check above).
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
