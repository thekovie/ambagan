import { formatMinor } from "@/lib/money";
import { apportion } from "./apportion";
import {
  SPLIT_LIMITS,
  WHOLE_BP,
  splitInputSchema,
  type ExtraKind,
  type SplitExtra,
  type SplitIssue,
  type SplitLine,
  type SplitMethod,
  type SplitOutcome,
  type SplitShare,
} from "./schema";

const fail = (issue: SplitIssue): SplitOutcome => ({ ok: false, issues: [issue] });
const peso = (minor: number) => formatMinor(Math.abs(minor), "PHP");

/** 3333 -> "33.33", 5000 -> "50", 1250 -> "12.5". */
export function formatBp(bp: number): string {
  return (bp / 100).toFixed(2).replace(/\.?0+$/, "");
}

/** "33.33", "50%" or " 7.05 " to basis points (3333, 5000, 705). Null for anything else, including more than 100% or finer than 0.01%. */
export function parsePercentToBp(input: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(input.trim().replace(/%$/, "").trim());
  if (!match) return null;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return bp <= WHOLE_BP ? bp : null;
}

function firstDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

/** Checks shared by every method: who is in, and how big the bill is. */
function checkPeopleAndTotal(userIds: readonly string[], totalMinor: number): SplitIssue | null {
  if (userIds.length === 0) return { code: "NO_PARTICIPANTS", message: "Choose at least one person to split with." };
  if (userIds.length > SPLIT_LIMITS.maxParticipants) {
    return { code: "TOO_MANY_PARTICIPANTS", message: `A bill can be split between at most ${SPLIT_LIMITS.maxParticipants} people.` };
  }
  if (firstDuplicate(userIds)) return { code: "DUPLICATE_PARTICIPANT", message: "Someone is listed more than once." };
  if (totalMinor <= 0) return { code: "TOTAL_NOT_POSITIVE", message: "The total must be more than zero." };
  if (totalMinor > SPLIT_LIMITS.maxTotalMinor) {
    return { code: "TOTAL_TOO_LARGE", message: `The total can be at most ${peso(SPLIT_LIMITS.maxTotalMinor)}.` };
  }
  return null;
}

function finish(method: SplitMethod, shares: SplitShare[]): SplitOutcome {
  return {
    ok: true,
    result: { v: 1, engine: 1, method, totalMinor: shares.reduce((sum, share) => sum + share.amountMinor, 0), shares },
  };
}

type SimpleInput = Exclude<ReturnType<typeof splitInputSchema.parse>, { method: "ITEMS" }>;

/** Equal, shares, percent and exact: one amount per person and a single "Your share" line. */
function computeSimple(data: SimpleInput, seed: string): SplitOutcome {
  const people: { userId: string; weight: number }[] =
    data.method === "EQUAL"
      ? data.participants.map((userId) => ({ userId, weight: 1 }))
      : data.method === "SHARES"
        ? data.entries.map((e) => ({ userId: e.userId, weight: e.shares }))
        : data.method === "PERCENT"
          ? data.entries.map((e) => ({ userId: e.userId, weight: e.bp }))
          : data.entries.map((e) => ({ userId: e.userId, weight: e.amountMinor }));

  const common = checkPeopleAndTotal(
    people.map((p) => p.userId),
    data.totalMinor,
  );
  if (common) return fail(common);

  const weightSum = people.reduce((sum, p) => sum + p.weight, 0);
  let amounts: Map<string, number>;
  let note: (weight: number) => string;

  if (data.method === "EXACT") {
    const difference = data.totalMinor - weightSum;
    if (difference !== 0) {
      return fail({
        code: "EXACT_MISMATCH",
        amountMinor: difference,
        message: difference > 0 ? `${peso(difference)} left to assign.` : `${peso(difference)} too much.`,
      });
    }
    amounts = new Map(people.map((p) => [p.userId, p.weight]));
    note = () => "Set by the admin";
  } else {
    if (data.method === "PERCENT" && weightSum !== WHOLE_BP) {
      const remaining = WHOLE_BP - weightSum;
      return fail({
        code: "PERCENT_NOT_100",
        bp: remaining,
        message: remaining > 0 ? `${formatBp(remaining)}% left to assign.` : `${formatBp(-remaining)}% too much.`,
      });
    }
    if (data.method === "SHARES" && weightSum === 0) {
      return fail({ code: "SHARES_NO_WEIGHT", message: "Give at least one person a share." });
    }
    amounts = apportion(data.totalMinor, people.map((p) => ({ key: p.userId, weight: p.weight })), seed);
    note =
      data.method === "EQUAL"
        ? () => `Split equally between ${people.length}`
        : data.method === "SHARES"
          ? (weight) => `${weight} of ${weightSum} ${weightSum === 1 ? "share" : "shares"}`
          : (weight) => `${formatBp(weight)}% of the total`;
  }

  return finish(
    data.method,
    people.map(({ userId, weight }) => {
      const amountMinor = amounts.get(userId)!;
      return { userId, amountMinor, lines: [{ kind: "BASE", label: "Your share", amountMinor, note: note(weight) }] };
    }),
  );
}

const EXTRA_LABELS: Record<ExtraKind, string> = {
  TAX: "Tax",
  SERVICE: "Service charge",
  TIP: "Tip",
  DELIVERY: "Delivery",
  DISCOUNT: "Discount",
  OTHER: "Other",
};

type ItemsInput = Extract<ReturnType<typeof splitInputSchema.parse>, { method: "ITEMS" }>;

/** What an extra comes to in centavos. A percentage is of the item subtotal (extras never compound), rounded half up. */
function extraAmount(extra: SplitExtra, itemsTotal: number): number {
  if (extra.mode === "AMOUNT") return extra.valueMinor;
  return Number((BigInt(itemsTotal) * BigInt(extra.bp) + BigInt(5000)) / BigInt(10000));
}

function extraNote(extra: SplitExtra): string | undefined {
  if (extra.mode === "PERCENT") {
    return `${formatBp(extra.bp)}% of the items${extra.allocate === "EQUAL" ? ", split equally" : ""}`;
  }
  return extra.allocate === "EQUAL" ? "Split equally" : "In proportion to your items";
}

/** Line items shared among the people who had them, then extras (tax, service, tip, delivery, discount) on top. */
function computeItems(data: ItemsInput, seed: string): SplitOutcome {
  if (data.items.length === 0) return fail({ code: "NO_ITEMS", message: "Add at least one item." });
  if (data.items.length > SPLIT_LIMITS.maxItems) {
    return fail({ code: "TOO_MANY_ITEMS", message: `A bill can have at most ${SPLIT_LIMITS.maxItems} items.` });
  }
  if (data.extras.length > SPLIT_LIMITS.maxExtras) {
    return fail({ code: "TOO_MANY_EXTRAS", message: `A bill can have at most ${SPLIT_LIMITS.maxExtras} extra charges or discounts.` });
  }
  if (firstDuplicate([...data.items.map((i) => i.id), ...data.extras.map((e) => e.id)])) {
    return fail({ code: "DUPLICATE_ID", message: "Two items or extras share the same id." });
  }

  for (const [index, item] of data.items.entries()) {
    if (item.assignees.length === 0) {
      return fail({ code: "ITEM_NO_ASSIGNEES", path: `items.${index}.assignees`, message: `Choose who shared "${item.label}".` });
    }
    if (firstDuplicate(item.assignees)) {
      return fail({ code: "DUPLICATE_PARTICIPANT", path: `items.${index}.assignees`, message: `Someone is listed twice on "${item.label}".` });
    }
  }

  const userIds = [...new Set(data.items.flatMap((item) => item.assignees))];
  if (userIds.length > SPLIT_LIMITS.maxParticipants) {
    return fail({ code: "TOO_MANY_PARTICIPANTS", message: `A bill can be split between at most ${SPLIT_LIMITS.maxParticipants} people.` });
  }
  if (data.extras.some((e) => e.kind === "DISCOUNT" && e.allocate !== "PROPORTIONAL")) {
    return fail({ code: "DISCOUNT_NOT_PROPORTIONAL", message: "A discount has to be shared in proportion to what each person had." });
  }

  const lines = new Map<string, SplitLine[]>(userIds.map((userId) => [userId, []]));
  const subtotal = new Map<string, number>(userIds.map((userId) => [userId, 0]));
  let itemsTotal = 0;

  for (const item of data.items) {
    itemsTotal += item.priceMinor;
    const parts = apportion(item.priceMinor, item.assignees.map((key) => ({ key, weight: 1 })), `${seed}:${item.id}`);
    for (const [userId, amountMinor] of parts) {
      lines.get(userId)!.push({
        kind: "ITEM",
        label: item.label,
        amountMinor,
        ...(item.assignees.length > 1 ? { note: `Shared by ${item.assignees.length}` } : {}),
      });
      subtotal.set(userId, subtotal.get(userId)! + amountMinor);
    }
  }

  const amounts = data.extras.map((extra) => extraAmount(extra, itemsTotal));
  const discounts = data.extras.reduce((sum, extra, i) => sum + (extra.kind === "DISCOUNT" ? amounts[i] : 0), 0);
  const charges = data.extras.reduce((sum, extra, i) => sum + (extra.kind === "DISCOUNT" ? 0 : amounts[i]), 0);
  // The size limit is on what the bill comes to before discounts, so a discount can't be used to get past it.
  if (itemsTotal + charges > SPLIT_LIMITS.maxTotalMinor) {
    return fail({ code: "TOTAL_TOO_LARGE", message: `The total can be at most ${peso(SPLIT_LIMITS.maxTotalMinor)}.` });
  }
  if (discounts > itemsTotal) {
    return fail({
      code: "DISCOUNT_TOO_BIG",
      amountMinor: discounts - itemsTotal,
      message: `The discount can't be more than the items (${peso(itemsTotal)}).`,
    });
  }

  // Discounts weigh against what each person has left, not their original subtotal: several discounts rounding
  // against the same person can then never take more than they owe. Charges weigh by the original subtotal.
  const remaining = new Map(subtotal);
  for (const [index, extra] of data.extras.entries()) {
    if (amounts[index] === 0) continue; // a tiny percentage of a tiny bill can round to nothing
    const isDiscount = extra.kind === "DISCOUNT";
    const weights = userIds.map((key) => ({
      key,
      weight: extra.allocate === "EQUAL" ? 1 : (isDiscount ? remaining : subtotal).get(key)!,
    }));
    const parts = apportion(amounts[index], weights, `${seed}:${extra.id}`);
    const sign = isDiscount ? -1 : 1;
    for (const [userId, part] of parts) {
      if (part === 0) continue;
      if (isDiscount) remaining.set(userId, remaining.get(userId)! - part);
      const note = extraNote(extra);
      lines.get(userId)!.push({
        kind: "EXTRA",
        label: extra.label ?? EXTRA_LABELS[extra.kind],
        amountMinor: sign * part,
        ...(note ? { note } : {}),
      });
    }
  }

  const shares: SplitShare[] = userIds.map((userId) => {
    const own = lines.get(userId)!;
    return { userId, amountMinor: own.reduce((sum, line) => sum + line.amountMinor, 0), lines: own };
  });
  const total = shares.reduce((sum, share) => sum + share.amountMinor, 0);

  if (total <= 0) return fail({ code: "TOTAL_NOT_POSITIVE", message: "After the discount there is nothing left to collect." });
  if (data.receiptTotalMinor !== undefined && data.receiptTotalMinor !== total) {
    const difference = data.receiptTotalMinor - total;
    return fail({
      code: "RECEIPT_MISMATCH",
      amountMinor: difference,
      message: `The receipt says ${peso(data.receiptTotalMinor)} but the items and extras add up to ${peso(total)} (${peso(difference)} ${
        difference > 0 ? "missing" : "extra"
      }). Fix an item or add an Other charge.`,
    });
  }

  return finish("ITEMS", shares);
}

/**
 * Splits a bill. `input` is whatever the form produced; it is validated here, so the same call powers the live
 * preview and the server-side check. `seed` (the bill id) decides who gets an odd centavo, so a preview and the
 * saved bill always match. Pure and deterministic: same input and seed, same answer.
 */
export function computeSplit(input: unknown, seed: string): SplitOutcome {
  const parsed = splitInputSchema.safeParse(input);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path.join(".");
    return fail({ code: "INVALID_INPUT", ...(path ? { path } : {}), message: `Something in the split isn't valid${path ? ` (${path})` : ""}.` });
  }
  return parsed.data.method === "ITEMS" ? computeItems(parsed.data, seed) : computeSimple(parsed.data, seed);
}
