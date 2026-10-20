import { getSessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getQrForViewer } from "@/server/payments/methods";
import { qrResponse } from "@/server/payments/qr-response";

/**
 * Serves a payment method's QR image. Images are not in `public/`: every request is checked,
 * so signed-out visitors and deactivated users get nothing, and members only get active methods.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const qr = getQrForViewer(getDb(), user, id);
  if (!qr) return new Response("Not found", { status: 404 });
  return qrResponse(request, qr);
}
