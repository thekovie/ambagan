import { z } from "zod";

export const SPLIT_METHODS = ["EQUAL", "SHARES", "PERCENT", "EXACT", "ITEMS"] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];

export const EXTRA_KINDS = ["TAX", "SERVICE", "TIP", "DELIVERY", "DISCOUNT", "OTHER"] as const;
export type ExtraKind = (typeof EXTRA_KINDS)[number];

export const SPLIT_LIMITS = {
  maxParticipants: 50,
  maxItems: 60,
  maxExtras: 10,
  /** 1,000,000 pesos in centavos, the same ceiling the app uses for a plan's monthly fee. */
  maxTotalMinor: 100_000_000,
  maxSharesPerPerson: 99,
  maxLabel: 60,
} as const;

/** Basis points: 10000 is 100.00%. */
export const WHOLE_BP = 10_000;

const userId = z.string().min(1).max(64);
const itemId = z.string().min(1).max(64);
const label = z.string().trim().min(1).max(SPLIT_LIMITS.maxLabel);
/** Counts and amounts are checked as whole numbers here; the size limits are business rules with their own messages. */
const wholeMinor = z.number().int();

const equal = z.strictObject({
  v: z.literal(1),
  method: z.literal("EQUAL"),
  totalMinor: wholeMinor,
  participants: z.array(userId),
});

const shares = z.strictObject({
  v: z.literal(1),
  method: z.literal("SHARES"),
  totalMinor: wholeMinor,
  entries: z.array(z.strictObject({ userId, shares: z.number().int().min(0).max(SPLIT_LIMITS.maxSharesPerPerson) })),
});

const percent = z.strictObject({
  v: z.literal(1),
  method: z.literal("PERCENT"),
  totalMinor: wholeMinor,
  entries: z.array(z.strictObject({ userId, bp: z.number().int().min(0).max(WHOLE_BP) })),
});

const exact = z.strictObject({
  v: z.literal(1),
  method: z.literal("EXACT"),
  totalMinor: wholeMinor,
  entries: z.array(z.strictObject({ userId, amountMinor: z.number().int().min(0) })),
});

const extra = z.discriminatedUnion("mode", [
  z.strictObject({
    id: itemId,
    kind: z.enum(EXTRA_KINDS),
    label: label.optional(),
    mode: z.literal("AMOUNT"),
    valueMinor: z.number().int().min(1).max(SPLIT_LIMITS.maxTotalMinor),
    allocate: z.enum(["PROPORTIONAL", "EQUAL"]),
  }),
  z.strictObject({
    id: itemId,
    kind: z.enum(EXTRA_KINDS),
    label: label.optional(),
    mode: z.literal("PERCENT"),
    bp: z.number().int().min(1).max(WHOLE_BP),
    allocate: z.enum(["PROPORTIONAL", "EQUAL"]),
  }),
]);

const items = z.strictObject({
  v: z.literal(1),
  method: z.literal("ITEMS"),
  items: z.array(
    z.strictObject({
      id: itemId,
      label,
      priceMinor: z.number().int().min(1).max(SPLIT_LIMITS.maxTotalMinor),
      assignees: z.array(userId),
    }),
  ),
  extras: z.array(extra),
  /** What the receipt says in total; when given it must match what the items and extras add up to. */
  receiptTotalMinor: z.number().int().min(1).optional(),
});

/** What the admin entered. Stored with the bill and re-checked on the server; the client uses the same schema for its preview. */
export const splitInputSchema = z.discriminatedUnion("method", [equal, shares, percent, exact, items]);
export type SplitInput = z.infer<typeof splitInputSchema>;
export type SplitExtra = z.infer<typeof extra>;

export interface SplitLine {
  kind: "BASE" | "ITEM" | "EXTRA";
  label: string;
  /** Signed: a discount is negative. */
  amountMinor: number;
  note?: string;
}

export interface SplitShare {
  userId: string;
  amountMinor: number;
  lines: SplitLine[];
}

/** The computed split. Stored with the bill so what a friend sees never changes if the rounding rules do. */
export interface SplitResult {
  v: 1;
  engine: 1;
  method: SplitMethod;
  totalMinor: number;
  shares: SplitShare[];
}

export type SplitIssueCode =
  | "INVALID_INPUT"
  | "NO_PARTICIPANTS"
  | "TOO_MANY_PARTICIPANTS"
  | "DUPLICATE_PARTICIPANT"
  | "TOTAL_NOT_POSITIVE"
  | "TOTAL_TOO_LARGE"
  | "SHARES_NO_WEIGHT"
  | "PERCENT_NOT_100"
  | "EXACT_MISMATCH"
  | "NO_ITEMS"
  | "TOO_MANY_ITEMS"
  | "TOO_MANY_EXTRAS"
  | "DUPLICATE_ID"
  | "ITEM_NO_ASSIGNEES"
  | "DISCOUNT_NOT_PROPORTIONAL"
  | "DISCOUNT_TOO_BIG"
  | "RECEIPT_MISMATCH";

export interface SplitIssue {
  code: SplitIssueCode;
  /** Plain language, safe to show next to the field. */
  message: string;
  /** Where it went wrong, e.g. "entries.2.shares". */
  path?: string;
  /** For mismatches: centavos still to assign (negative when over). */
  amountMinor?: number;
  /** For percentages: basis points still to assign (negative when over). */
  bp?: number;
}

export type SplitOutcome = { ok: true; result: SplitResult } | { ok: false; issues: SplitIssue[] };
