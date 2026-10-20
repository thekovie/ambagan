"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { kickEmailQueue } from "@/server/email/worker";
import { PAYMENT_ERRORS, parsePaymentFormData, type PaymentFormState } from "@/server/payments/form-data";
import { requireShareAccess } from "@/server/share/access";
import { submitSharedPayment } from "@/server/share/report";

const INVALID_LINK = "This link isn't valid any more. Ask the person who sent it for a new one.";
const TOO_MANY = "Too many tries from here. Please wait a few minutes and try again.";

/**
 * Reports a payment through a private link. Bound to its token by the page (`action.bind(null, token)`), and the
 * token is checked first, before the form is read: the statement and the person come from the link, never the form.
 */
export async function submitSharedPaymentAction(token: string, _prev: PaymentFormState, formData: FormData): Promise<PaymentFormState> {
  const access = await requireShareAccess(token);
  if (!access.ok) return { error: access.limited ? TOO_MANY : INVALID_LINK };
  // A hand-made request can send anything here; the form reader below expects a real FormData.
  if (!(formData instanceof FormData)) return { error: INVALID_LINK };

  const parsed = parsePaymentFormData(formData);
  if (!parsed.ok) return parsed.state;

  const result = submitSharedPayment(getDb(), { token, input: parsed.value });
  if (!result.ok) {
    if (result.error === "INVALID_LINK") return { error: INVALID_LINK };
    if (result.error === "DUPLICATE_REFERENCE") return { errors: { transactionRef: PAYMENT_ERRORS.DUPLICATE_REFERENCE } };
    return { error: PAYMENT_ERRORS[result.error] };
  }

  kickEmailQueue();
  revalidatePath("/admin", "layout"); // the admin's "waiting for you" count
  redirect(`/s/${token}?sent=1`);
}
