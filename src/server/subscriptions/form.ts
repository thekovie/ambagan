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
  /** Late penalty in centavos for every `penaltyEveryDays` days a statement is late; 0 = none. */
  penaltyMinor: number;
  penaltyEveryDays: number;
  /** The most one late statement can be penalised; null = no limit. */
  penaltyCapMinor: number | null;
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
  // Blank means "no penalty" / "no limit".
  penaltyPesos: z.string().trim().optional(),
  penaltyEveryDays: z.coerce.number().int().min(1, "Pick 1 to 31 days").max(31, "Pick 1 to 31 days").default(1),
  penaltyCapPesos: z.string().trim().optional(),
};

/** Blank is "not set"; anything else must be a real amount of pesos. */
const optionalPesos = (v: string | undefined) => !v || (parsePesosToMinor(v) !== null && parsePesosToMinor(v)! <= MAX_FEE_MINOR);
const PESOS_ERROR = "Enter an amount in pesos with at most 2 decimals, or leave it blank";

const dueAfterIssue = (v: { issueDay: number; dueDay: number }) => v.dueDay >= v.issueDay;
const dueAfterIssueError = { path: ["dueDay"], message: "The due day can't be before the issue day" };

const minorOf = (v: string | undefined): number | null => (v ? parsePesosToMinor(v) : null);
const penaltyOk = (v: { penaltyPesos?: string; penaltyCapPesos?: string }) => optionalPesos(v.penaltyPesos);
const capOk = (v: { penaltyCapPesos?: string }) => optionalPesos(v.penaltyCapPesos);
/** A limit smaller than one penalty charge would stop the penalty from ever working as written. */
const capCoversOneCharge = (v: { penaltyPesos?: string; penaltyCapPesos?: string }) => {
  const charge = minorOf(v.penaltyPesos);
  const cap = minorOf(v.penaltyCapPesos);
  return !charge || !cap || cap >= charge;
};

const createSchema = z
  .object({
    ...fields,
    refPrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3,6}$/, "Use 3 to 6 letters, like SPOT"),
  })
  .refine(dueAfterIssue, dueAfterIssueError)
  .refine(penaltyOk, { path: ["penaltyPesos"], message: PESOS_ERROR })
  .refine(capOk, { path: ["penaltyCapPesos"], message: PESOS_ERROR })
  .refine(capCoversOneCharge, { path: ["penaltyCapPesos"], message: "Most per late statement must be at least the penalty amount" });

const updateSchema = z
  .object(fields)
  .refine(dueAfterIssue, dueAfterIssueError)
  .refine(penaltyOk, { path: ["penaltyPesos"], message: PESOS_ERROR })
  .refine(capOk, { path: ["penaltyCapPesos"], message: PESOS_ERROR })
  .refine(capCoversOneCharge, { path: ["penaltyCapPesos"], message: "Most per late statement must be at least the penalty amount" });

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
    penaltyMinor: minorOf(v.penaltyPesos) ?? 0,
    penaltyEveryDays: v.penaltyEveryDays,
    // A limit only means something next to a penalty.
    penaltyCapMinor: minorOf(v.penaltyPesos) ? minorOf(v.penaltyCapPesos) || null : null,
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
