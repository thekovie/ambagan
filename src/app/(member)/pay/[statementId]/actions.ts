"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { kickEmailQueue } from "@/server/email/worker";
import { PAYMENT_ERRORS, parsePaymentFormData, type PaymentFormState } from "@/server/payments/form-data";
import { submitPayment } from "@/server/payments/submit";

/** Records the member's payment report (see `parsePaymentFormData` for what is, and is not, sent). */
export async function submitPaymentAction(_prev: PaymentFormState, formData: FormData): Promise<PaymentFormState> {
  const user = await requireUser();

  const parsed = parsePaymentFormData(formData);
  if (!parsed.ok) return parsed.state;

  const result = submitPayment(getDb(), { userId: user.id, input: parsed.value });
  if (!result.ok) {
    if (result.error === "DUPLICATE_REFERENCE") return { errors: { transactionRef: PAYMENT_ERRORS.DUPLICATE_REFERENCE } };
    return { error: PAYMENT_ERRORS[result.error] };
  }

  kickEmailQueue();
  revalidatePath("/", "layout");
  redirect("/payments?sent=1");
}
