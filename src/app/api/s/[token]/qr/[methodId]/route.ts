import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { paymentMethods } from "@/server/db/schema";
import { qrResponse } from "@/server/payments/qr-response";
import { requireShareAccess } from "@/server/share/access";

const NO_STORE = { "Cache-Control": "private, no-store", "Referrer-Policy": "same-origin", "X-Robots-Tag": "noindex" };

/**
 * A payment method's QR image for someone holding a private link. The link is checked on every request (and a
 * flood of bad ones is turned away), and only methods that are switched on are served, exactly as for signed-in members.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string; methodId: string }> }) {
  const { token, methodId } = await params;
  const access = await requireShareAccess(token);
  if (!access.ok) return new Response(access.limited ? "Too many requests" : "Not found", { status: access.limited ? 429 : 404, headers: NO_STORE });

  const method = getDb().select().from(paymentMethods).where(eq(paymentMethods.id, methodId)).get();
  if (!method?.qrFile || !method.qrMime || !method.isActive) return new Response("Not found", { status: 404, headers: NO_STORE });

  const response = qrResponse(request, { file: method.qrFile, mime: method.qrMime, label: method.label });
  for (const [key, value] of Object.entries(NO_STORE)) response.headers.set(key, value);
  return response;
}
