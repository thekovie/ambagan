import { toLocalInputValue } from "@/lib/dates";
import type { Confidence, ParsedReceipt } from "./parse";

/** The payment form's fields, as the strings the inputs hold. */
export interface PaymentFields {
  destination: string;
  app: string;
  appOther: string;
  amount: string;
  reference: string;
  date: string;
  notes: string;
}

export type DetectedField = "amount" | "reference" | "date" | "app";

// Only values we're reasonably sure of go into the form. Low confidence stays out: a wrong
// pre-filled number is worse than an empty box.
const USABLE: Confidence[] = ["high", "medium"];
const usable = (confidence: Confidence) => USABLE.includes(confidence);

/** Which fields a receipt can fill in, judged from confidence alone (independent of the form's contents). */
export function detectedFields(parsed: ParsedReceipt, knownApps: string[]): DetectedField[] {
  const detected: DetectedField[] = [];
  if (parsed.amountMinor.value !== null && usable(parsed.amountMinor.confidence)) detected.push("amount");
  if (parsed.reference.value !== null && usable(parsed.reference.confidence)) detected.push("reference");
  if (parsed.transactionDate.value !== null && usable(parsed.transactionDate.confidence)) detected.push("date");
  if (parsed.sendingApp && knownApps.includes(parsed.sendingApp)) detected.push("app");
  return detected;
}

/**
 * Pre-fills the form from a parsed receipt. It never touches the destination account (the member
 * chooses where they paid), the note, or any field it could not read.
 */
export function applyReceipt(
  fields: PaymentFields,
  parsed: ParsedReceipt,
  knownApps: string[],
): { fields: PaymentFields; detected: DetectedField[] } {
  const detected = detectedFields(parsed, knownApps);
  const next = { ...fields };
  if (detected.includes("amount")) next.amount = (parsed.amountMinor.value! / 100).toFixed(2);
  if (detected.includes("reference")) next.reference = parsed.reference.value!;
  if (detected.includes("date")) next.date = toLocalInputValue(parsed.transactionDate.value!);
  if (detected.includes("app")) next.app = parsed.sendingApp!;
  return { fields: next, detected };
}
