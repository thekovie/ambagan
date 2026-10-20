import type { Db } from "@/server/db/client";
import type { PaymentInput } from "@/server/payments/form";
import { submitPayment, type SubmitResult } from "@/server/payments/submit";
import { shareSecret, verifyShareToken } from "./token";

export type SharedPaymentResult = SubmitResult | { ok: false; error: "INVALID_LINK" };

/**
 * A friend reports their payment through their private link. The link decides everything about who and what:
 * the statement and the person come from the verified token, and whatever statement id the form carried is
 * overwritten, so a link can never be used to file a payment against anyone else's share. From there it is
 * the ordinary payment report (same rules, same "waiting for the admin's check", same emails).
 */
export function submitSharedPayment(
  db: Db,
  args: { token: string; input: PaymentInput; now?: Date; secret?: string },
): SharedPaymentResult {
  const now = args.now ?? new Date();
  const access = verifyShareToken(db, args.token, now, args.secret ?? shareSecret());
  if (!access.ok) return { ok: false, error: "INVALID_LINK" };
  return submitPayment(db, { userId: access.user.id, input: { ...args.input, statementId: access.statement.id }, now });
}
