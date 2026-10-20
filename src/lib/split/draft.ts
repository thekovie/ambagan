import { parsePesosToMinor } from "@/lib/money";
import { parsePercentToBp } from "./compute";
import type { ExtraKind, SplitMethod } from "./schema";

/** One person who is in the split, with whatever the admin has typed for them so far. */
export interface DraftPerson {
  id: string;
  name: string;
  shares: string;
  percent: string;
  amount: string;
}

export type DraftMethod = Extract<SplitMethod, "EQUAL" | "SHARES" | "PERCENT" | "EXACT">;

export type SplitDraft = { input: unknown } | { waiting: string };

/** One line on the receipt, with whoever shared it. */
export interface DraftItem {
  id: string;
  label: string;
  priceText: string;
  assignees: string[];
}

/** A tax, service charge, tip, delivery fee, discount or other adjustment on the whole bill. */
export interface DraftExtra {
  id: string;
  kind: ExtraKind;
  /** Only for "Other": what to call it. */
  label: string;
  mode: "AMOUNT" | "PERCENT";
  valueText: string;
  allocate: "PROPORTIONAL" | "EQUAL";
}

const EXTRA_NAMES: Record<ExtraKind, string> = {
  TAX: "tax",
  SERVICE: "service charge",
  TIP: "tip",
  DELIVERY: "delivery fee",
  DISCOUNT: "discount",
  OTHER: "extra charge",
};

/**
 * Turns what is on the builder's screen into the split input the server will check, or says what is still missing.
 * It only shapes the input; every rule (totals adding up, limits) is the engine's, so the preview, which runs the
 * engine on this, and the saved bill, which runs it again on the server, can never disagree. A blank percent or
 * amount counts as zero so the "left to assign" message can guide the admin while they type.
 */
export function buildSplitInput(args: { method: DraftMethod; totalText: string; people: DraftPerson[] }): SplitDraft {
  const { method, totalText, people } = args;
  const totalMinor = parsePesosToMinor(totalText);
  if (!totalText.trim()) return { waiting: "Enter the total to see the split." };
  if (!totalMinor) return { waiting: "That total isn't an amount. Use pesos, like 1,500.50." };
  if (people.length === 0) return { waiting: "Choose who is in." };

  const base = { v: 1, totalMinor };
  if (method === "EQUAL") return { input: { ...base, method, participants: people.map((p) => p.id) } };

  const entries = [];
  for (const person of people) {
    if (method === "SHARES") {
      if (!/^\d{1,2}$/.test(person.shares.trim())) return { waiting: `Enter shares for ${person.name} (a whole number, 0 to 99).` };
      entries.push({ userId: person.id, shares: Number(person.shares) });
    } else if (method === "PERCENT") {
      const bp = person.percent.trim() === "" ? 0 : parsePercentToBp(person.percent);
      if (bp === null) return { waiting: `Check the percentage for ${person.name}.` };
      entries.push({ userId: person.id, bp });
    } else {
      const amountMinor = person.amount.trim() === "" ? 0 : parsePesosToMinor(person.amount);
      if (amountMinor === null) return { waiting: `Check the amount for ${person.name}.` };
      entries.push({ userId: person.id, amountMinor });
    }
  }
  return { input: { ...base, method, entries } };
}

/**
 * The itemised form as split input: line items shared among chosen people, plus extras on the whole bill. As with
 * `buildSplitInput` it only shapes the input and says what is missing; the engine owns every rule. People who are
 * no longer in the split are dropped from each item, and a discount is always shared in proportion (the engine
 * insists, and an equal discount could take someone below zero).
 */
export function buildItemsSplitInput(args: { people: DraftPerson[]; items: DraftItem[]; extras: DraftExtra[]; receiptText: string }): SplitDraft {
  const { people, items, extras, receiptText } = args;
  if (items.length === 0) return { waiting: "Add at least one item." };
  if (people.length === 0) return { waiting: "Choose who is in." };
  const inSplit = new Set(people.map((p) => p.id));

  const builtItems = [];
  for (const [index, item] of items.entries()) {
    const label = item.label.trim();
    if (!label) return { waiting: `Give item ${index + 1} a name.` };
    if (!item.priceText.trim()) return { waiting: `Enter the price of "${label}".` };
    const priceMinor = parsePesosToMinor(item.priceText);
    if (!priceMinor) return { waiting: `Check the price of "${label}".` };
    const assignees = item.assignees.filter((id) => inSplit.has(id));
    if (assignees.length === 0) return { waiting: `Choose who shared "${label}".` };
    builtItems.push({ id: item.id, label, priceMinor, assignees });
  }

  const builtExtras = [];
  for (const extra of extras) {
    const name = extra.kind === "OTHER" && extra.label.trim() ? extra.label.trim() : EXTRA_NAMES[extra.kind];
    const label = extra.kind === "OTHER" && extra.label.trim() ? { label: extra.label.trim() } : {};
    const allocate = extra.kind === "DISCOUNT" ? "PROPORTIONAL" : extra.allocate;
    if (!extra.valueText.trim()) return { waiting: `Enter ${extra.mode === "PERCENT" ? "a percentage" : "an amount"} for the ${name}.` };
    if (extra.mode === "PERCENT") {
      const bp = parsePercentToBp(extra.valueText);
      if (!bp) return { waiting: `Check the percentage for the ${name}.` };
      builtExtras.push({ id: extra.id, kind: extra.kind, ...label, mode: "PERCENT", bp, allocate });
    } else {
      const valueMinor = parsePesosToMinor(extra.valueText);
      if (!valueMinor) return { waiting: `Check the amount for ${extra.kind === "OTHER" && extra.label.trim() ? name : `the ${name}`}.` };
      builtExtras.push({ id: extra.id, kind: extra.kind, ...label, mode: "AMOUNT", valueMinor, allocate });
    }
  }

  const input: Record<string, unknown> = { v: 1, method: "ITEMS", items: builtItems, extras: builtExtras };
  if (receiptText.trim()) {
    const receiptTotalMinor = parsePesosToMinor(receiptText);
    if (!receiptTotalMinor) return { waiting: "Check the total on the receipt." };
    input.receiptTotalMinor = receiptTotalMinor;
  }
  return { input };
}
