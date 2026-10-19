import { z } from "zod";
import { parsePesosToMinor } from "@/lib/money";

export interface SubscriptionInput {
  name: string;
  /** Prefix of statement references, e.g. "SPOT". Fixed after creation. */
  refPrefix: string;
  feeMinor: number;
  /** Day of month (1-28) statements are issued / due, in Asia/Manila. */
  issueDay: number;
  dueDay: number;
  paymentInstructions: string | null;
  isActive: boolean;
}

export type SubscriptionUpdate = Omit<SubscriptionInput, "refPrefix">;

/** ₱1,000,000: far above any real share, far below where integers stop being exact. */
const MAX_FEE_MINOR = 100_000_000;

// Days stop at 28 so every month has them.
const day = z.coerce.number().int().min(1, "Pick a day from 1 to 28").max(28, "Pick a day from 1 to 28");

const fields = {
  name: z.string().trim().min(1, "Enter a name").max(60, "Keep the name under 60 characters"),
  feePesos: z.string().refine((v) => {
    const minor = parsePesosToMinor(v);
    return minor !== null && minor > 0 && minor <= MAX_FEE_MINOR;
  }, "Enter an amount from ₱0.01 to ₱1,000,000, with at most 2 decimals"),
  issueDay: day,
  dueDay: day,
  paymentInstructions: z.string().trim().max(1000, "Keep instructions under 1000 characters").optional(),
  isActive: z.string().optional(),
};

const dueAfterIssue = (v: { issueDay: number; dueDay: number }) => v.dueDay >= v.issueDay;
const dueAfterIssueError = { path: ["dueDay"], message: "The due day can't be before the issue day" };

const createSchema = z
  .object({
    ...fields,
    refPrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3,6}$/, "Use 3 to 6 letters, like SPOT"),
  })
  .refine(dueAfterIssue, dueAfterIssueError);

const updateSchema = z.object(fields).refine(dueAfterIssue, dueAfterIssueError);

export type FormErrors = Record<string, string>;

function toErrors(error: z.ZodError): FormErrors {
  const errors: FormErrors = {};
  for (const issue of error.issues) errors[String(issue.path[0])] ??= issue.message;
  return errors;
}

type Fields = z.infer<typeof updateSchema>;

function toUpdate(v: Fields): SubscriptionUpdate {
  return {
    name: v.name,
    feeMinor: parsePesosToMinor(v.feePesos)!,
    issueDay: v.issueDay,
    dueDay: v.dueDay,
    paymentInstructions: v.paymentInstructions || null,
    isActive: v.isActive === "on" || v.isActive === "true",
  };
}

export type CreateFormResult = { ok: true; value: SubscriptionInput } | { ok: false; errors: FormErrors };
export type UpdateFormResult = { ok: true; value: SubscriptionUpdate } | { ok: false; errors: FormErrors };

/** Raw form strings -> validated input for a new subscription. */
export function parseSubscriptionForm(raw: Record<string, unknown>): CreateFormResult {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: toErrors(parsed.error) };
  return { ok: true, value: { ...toUpdate(parsed.data), refPrefix: parsed.data.refPrefix } };
}

/** Same rules for an existing subscription; any submitted refPrefix is ignored. */
export function parseSubscriptionUpdateForm(raw: Record<string, unknown>): UpdateFormResult {
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: toErrors(parsed.error) };
  return { ok: true, value: toUpdate(parsed.data) };
}
