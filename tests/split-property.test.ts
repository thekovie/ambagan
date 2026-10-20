import { describe, expect, it } from "vitest";
import { computeSplit } from "@/lib/split";

/** Small deterministic PRNG so a failure can be reproduced from its round number. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(random: () => number, values: readonly T[]) => values[Math.floor(random() * values.length)];
const int = (random: () => number, min: number, max: number) => min + Math.floor(random() * (max - min + 1));

function randomInput(random: () => number): unknown {
  const people = Array.from({ length: int(random, 1, 7) }, (_, i) => `u${i}`);
  const total = int(random, 1, 400_000);
  switch (pick(random, ["EQUAL", "SHARES", "PERCENT", "EXACT", "ITEMS"] as const)) {
    case "EQUAL":
      return { v: 1, method: "EQUAL", totalMinor: total, participants: people };
    case "SHARES":
      return { v: 1, method: "SHARES", totalMinor: total, entries: people.map((userId) => ({ userId, shares: int(random, 0, 4) })) };
    case "PERCENT": {
      // Often valid (sums to 100%), sometimes deliberately off by a little.
      const bps = people.map(() => int(random, 1, 100));
      const sum = bps.reduce((a, b) => a + b, 0);
      const scaled = bps.map((bp) => Math.floor((bp * 10_000) / sum));
      scaled[0] += 10_000 - scaled.reduce((a, b) => a + b, 0) + (random() < 0.2 ? 1 : 0);
      return { v: 1, method: "PERCENT", totalMinor: total, entries: people.map((userId, i) => ({ userId, bp: scaled[i] })) };
    }
    case "EXACT": {
      const amounts = people.map(() => int(random, 0, 50_000));
      return {
        v: 1,
        method: "EXACT",
        totalMinor: random() < 0.8 ? amounts.reduce((a, b) => a + b, 0) : total,
        entries: people.map((userId, i) => ({ userId, amountMinor: amounts[i] })),
      };
    }
    default:
      return {
        v: 1,
        method: "ITEMS",
        items: Array.from({ length: int(random, 1, 5) }, (_, i) => ({
          id: `i${i}`,
          label: `Item ${i}`,
          priceMinor: int(random, 1, 30_000),
          assignees: people.filter(() => random() < 0.6).concat(people[0]).filter((p, idx, all) => all.indexOf(p) === idx),
        })),
        extras: Array.from({ length: int(random, 0, 4) }, (_, i) => {
          const kind = pick(random, ["TAX", "SERVICE", "TIP", "DELIVERY", "DISCOUNT", "OTHER"] as const);
          const allocate = kind === "DISCOUNT" ? "PROPORTIONAL" : pick(random, ["PROPORTIONAL", "EQUAL"] as const);
          return random() < 0.5
            ? { id: `e${i}`, kind, mode: "AMOUNT", valueMinor: int(random, 1, 5_000), allocate }
            : { id: `e${i}`, kind, mode: "PERCENT", bp: int(random, 1, 4_000), allocate };
        }),
      };
  }
}

describe("computeSplit properties", () => {
  it("never throws, and every accepted split is exact, non-negative and explained line by line", () => {
    const random = mulberry32(2026);
    let accepted = 0;
    for (let round = 0; round < 4000; round++) {
      const input = randomInput(random);
      const outcome = computeSplit(input, `round-${round}`);
      if (!outcome.ok) {
        expect(outcome.issues.length).toBeGreaterThan(0);
        for (const issue of outcome.issues) expect(issue.message.length).toBeGreaterThan(0);
        continue;
      }
      accepted++;
      const { result } = outcome;
      expect(result.shares.reduce((sum, s) => sum + s.amountMinor, 0), `round ${round}`).toBe(result.totalMinor);
      expect(result.totalMinor, `round ${round}`).toBeGreaterThan(0);
      for (const share of result.shares) {
        expect(Number.isInteger(share.amountMinor)).toBe(true);
        expect(share.amountMinor, `round ${round}`).toBeGreaterThanOrEqual(0);
        expect(share.lines.reduce((sum, l) => sum + l.amountMinor, 0), `round ${round}`).toBe(share.amountMinor);
      }
      // Same input, same seed: same answer.
      expect(computeSplit(input, `round-${round}`)).toEqual(outcome);
    }
    expect(accepted).toBeGreaterThan(2000);
  });
});
