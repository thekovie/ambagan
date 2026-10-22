import { z } from "zod";
import { toLocalInputValue } from "@/lib/dates";
import { parsePesosToMinor } from "@/lib/money";
import { cleanFreeText } from "@/lib/names";

/** References compare equal ignoring case, spaces and punctuation: "7034 512 840193" == "7034-512-840193". */
export const normalizeReference = (reference: string): string => reference.toUpperCase().replace(/[^A-Z0-9]/g, "");

const MAX_AMOUNT_MINOR = 100_000_000; // PHP 1,000,000
const MIN_REFERENCE_LENGTH = 6;
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000; // clock skew between phone and server
const MAX_PAST_DAYS = 180;

export interface PaymentInput {
  statementId: string;
  /** Where the money went (one of our configured accounts). */
  destinationMethodId: string;
  /** Where it came from: the member's own app or bank. Stored separately on purpose. */
  sendingApp: string;
  amountMinor: number;
  transactionRef: string;
  transactionDate: Date;
  notes: string | null;
}

const schema = z.object({
  statementId: z.string().min(1),
  destinationMethodId: z.string().min(1, "Pick where you sent the money"),
  sendingApp: z.string().trim().min(1, "Say which app or bank you paid from").max(40, "Keep it under 40 characters"),
  amountPesos: z.string().refine((value) => {
    const minor = parsePesosToMinor(value);
    return minor !== null && minor > 0 && minor <= MAX_AMOUNT_MINOR;
  }, "Enter the amount you sent, like 75.50"),
  transactionRef: z
    .string()
    .trim()
    .min(1, "Enter the reference number from your receipt")
    .max(64, "That reference is too long")
    .regex(/^[A-Za-z0-9][A-Za-z0-9 \-_.]*$/, "Use only letters, numbers, spaces, dashes, dots and underscores")
    .refine((value) => normalizeReference(value).length >= MIN_REFERENCE_LENGTH, "That reference looks too short"),
  // <input type="datetime-local"> value, read as Asia/Manila time.
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter the date and time of the payment"),
  notes: z.string().transform(cleanFreeText).pipe(z.string().max(300, "Keep notes under 300 characters")).optional(),
});

export type PaymentFormResult = { ok: true; value: PaymentInput } | { ok: false; errors: Record<string, string> };

export function parsePaymentForm(raw: Record<string, unknown>, now = new Date()): PaymentFormResult {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { ok: false, errors };
  }
  const v = parsed.data;

  // Manila has no daylight saving, so a literal +08:00 is exact. JavaScript silently rolls impossible
  // dates forward (Sep 31 becomes Oct 1, hour 24 becomes the next day), so the value must survive a round trip.
  const transactionDate = new Date(`${v.transactionDate}:00+08:00`);
  if (Number.isNaN(transactionDate.getTime()) || toLocalInputValue(transactionDate) !== v.transactionDate) {
    return { ok: false, errors: { transactionDate: "That date doesn't exist" } };
  }
  if (transactionDate.getTime() > now.getTime() + MAX_FUTURE_MS) {
    return { ok: false, errors: { transactionDate: "That date is in the future" } };
  }
  if (transactionDate.getTime() < now.getTime() - MAX_PAST_DAYS * 24 * 60 * 60 * 1000) {
    return { ok: false, errors: { transactionDate: "That date is too long ago to be this payment" } };
  }

  return {
    ok: true,
    value: {
      statementId: v.statementId,
      destinationMethodId: v.destinationMethodId,
      sendingApp: v.sendingApp,
      amountMinor: parsePesosToMinor(v.amountPesos)!,
      transactionRef: v.transactionRef,
      transactionDate,
      notes: v.notes || null,
    },
  };
}
