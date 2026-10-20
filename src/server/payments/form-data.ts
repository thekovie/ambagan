import { parsePaymentForm, type PaymentInput } from "./form";

/** What a payment form action hands back to the form. */
export interface PaymentFormState {
  errors?: Record<string, string>;
  error?: string;
}

const OTHER = "Other";

/** Plain-language messages for each way a payment report can be refused. */
export const PAYMENT_ERRORS = {
  NOT_FOUND: "We couldn't find that statement.",
  NOT_PAYABLE: "This statement isn't waiting for a payment any more. Open it to see where things stand.",
  INVALID_DESTINATION: "That payment method isn't available. Pick another one.",
  DUPLICATE_REFERENCE:
    "That reference number has already been reported. Check the number on your receipt, or ask the admin if you think this is a mistake.",
} as const;

/**
 * Reads the payment report out of the form. Only the structured fields the person confirmed arrive here:
 * receipts are read in the browser and never uploaded, and raw OCR text is never sent.
 */
export function parsePaymentFormData(formData: FormData): { ok: true; value: PaymentInput } | { ok: false; state: PaymentFormState } {
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
  if (parsed.ok) return parsed;

  // The "Other" text box is where a missing app name should be reported.
  const errors = { ...parsed.errors };
  if (choice === OTHER && errors.sendingApp) {
    errors.sendingAppOther = errors.sendingApp;
    delete errors.sendingApp; // one message, not two alerts
  }
  return { ok: false, state: { errors } };
}
