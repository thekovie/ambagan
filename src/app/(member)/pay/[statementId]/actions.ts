"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { parsePaymentForm } from "@/server/payments/form";
import { submitPayment } from "@/server/payments/submit";

export interface PaymentFormState {
  errors?: Record<string, string>;
  error?: string;
}

const OTHER = "Other";

const ERRORS = {
  NOT_FOUND: "We couldn't find that statement.",
  NOT_PAYABLE: "This statement isn't waiting for a payment any more. Open it to see where things stand.",
  INVALID_DESTINATION: "That payment method isn't available. Pick another one.",
  DUPLICATE_REFERENCE:
    "That reference number has already been reported. Check the number on your receipt, or ask the admin if you think this is a mistake.",
} as const;

/**
 * Records the member's payment report. Only the structured fields the member confirmed arrive here:
 * receipts are read in the browser and never uploaded, and raw OCR text is never sent.
 */
export async function submitPaymentAction(_prev: PaymentFormState, formData: FormData): Promise<PaymentFormState> {
  const user = await requireUser();

  const choice = String(formData.get("sendingAppChoice") ?? "");
  const sendingApp = choice === OTHER ? String(formData.get("sendingAppOther") ?? "") : choice;

  const parsed = parsePaymentForm({
    statementId: formData.get("statementId"),
    destinationMethodId: formData.get("destinationMethodId"),
    sendingApp,
    amountPesos: formData.get("amountPesos"),
    transactionRef: formData.get("transactionRef"),
    transactionDate: formData.get("transactionDate"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.ok) {
    // The "Other" text box is where a missing app name should be reported.
    const errors = { ...parsed.errors };
    if (choice === OTHER && errors.sendingApp) {
      errors.sendingAppOther = errors.sendingApp;
      delete errors.sendingApp; // one message, not two alerts
    }
    return { errors };
  }

  const result = submitPayment(getDb(), { userId: user.id, input: parsed.value });
  if (!result.ok) {
    if (result.error === "DUPLICATE_REFERENCE") return { errors: { transactionRef: ERRORS.DUPLICATE_REFERENCE } };
    return { error: ERRORS[result.error] };
  }

  revalidatePath("/", "layout");
  redirect("/payments?sent=1");
}
