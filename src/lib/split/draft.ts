import { parsePesosToMinor } from "@/lib/money";
import { parsePercentToBp } from "./compute";
import type { SplitMethod } from "./schema";

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
