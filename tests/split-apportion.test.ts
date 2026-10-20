import { describe, expect, it } from "vitest";
import { apportion, fnv1a } from "@/lib/split/apportion";

/** Small deterministic PRNG so the property tests are repeatable. */
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

const sum = (values: Iterable<number>) => [...values].reduce((a, b) => a + b, 0);
const entries = (weights: number[]) => weights.map((weight, i) => ({ key: `p${i}`, weight }));

describe("fnv1a", () => {
  it("is stable and spreads different inputs", () => {
    expect(fnv1a("abc")).toBe(fnv1a("abc"));
    expect(fnv1a("abc")).not.toBe(fnv1a("abd"));
    expect(fnv1a("")).toBe(0x811c9dc5);
  });
});

describe("apportion", () => {
  it("splits 100 centavos three ways into 34, 33 and 33", () => {
    const result = apportion(100, entries([1, 1, 1]), "seed");
    expect([...result.values()].sort()).toEqual([33, 33, 34]);
    expect(sum(result.values())).toBe(100);
  });

  it("splits in proportion to the weights and still adds up exactly", () => {
    const result = apportion(3000, entries([2, 1]), "seed");
    expect(result.get("p0")).toBe(2000);
    expect(result.get("p1")).toBe(1000);
  });

  it("never gives a centavo to someone with zero weight", () => {
    for (let n = 0; n < 200; n++) {
      const result = apportion(1 + n, [...entries([1, 0, 1, 0, 3])], `seed-${n}`);
      expect(result.get("p1")).toBe(0);
      expect(result.get("p3")).toBe(0);
      expect(sum(result.values())).toBe(1 + n);
    }
  });

  it("gives everyone zero when the total is zero", () => {
    const result = apportion(0, entries([1, 2, 3]), "seed");
    expect([...result.values()]).toEqual([0, 0, 0]);
  });

  it("is deterministic for the same seed and does not depend on the order of entries", () => {
    const forward = entries([1, 1, 1, 1, 1, 1, 1]);
    const reversed = [...forward].reverse();
    for (let n = 0; n < 50; n++) {
      const a = apportion(1000 + n, forward, `bill-${n}`);
      const b = apportion(1000 + n, reversed, `bill-${n}`);
      expect(Object.fromEntries(a)).toEqual(Object.fromEntries(b));
    }
  });

  it("spreads the odd centavo around instead of always charging the same person", () => {
    const counts = { p0: 0, p1: 0, p2: 0 };
    const runs = 600;
    for (let n = 0; n < runs; n++) {
      const result = apportion(100, entries([1, 1, 1]), `bill-${n}`);
      for (const [key, value] of result) if (value === 34) counts[key as keyof typeof counts]++;
    }
    for (const count of Object.values(counts)) {
      expect(count).toBeGreaterThan(runs * 0.25);
      expect(count).toBeLessThan(runs * 0.42);
    }
  });

  it("stays exact with the largest totals and weights (no float rounding)", () => {
    const total = 100_000_000;
    const result = apportion(total, entries([99_999_999, 1, 12_345_678]), "big");
    expect(sum(result.values())).toBe(total);
    for (const value of result.values()) expect(Number.isInteger(value)).toBe(true);
  });

  it("stays exact even when the weights add up to more than a double can hold", () => {
    const huge = Number.MAX_SAFE_INTEGER;
    const result = apportion(99_999_999, entries([huge, huge, huge, huge]), "huge");
    expect(sum(result.values())).toBe(99_999_999);
  });

  it("always adds up to the total, never goes negative, and stays within one centavo of the exact share", () => {
    const random = mulberry32(42);
    for (let round = 0; round < 500; round++) {
      const people = 1 + Math.floor(random() * 12);
      const weights = Array.from({ length: people }, () => (random() < 0.2 ? 0 : 1 + Math.floor(random() * 99)));
      if (sum(weights) === 0) weights[0] = 1;
      const total = Math.floor(random() * 5_000_000);
      const result = apportion(total, entries(weights), `r${round}`);
      const weightSum = sum(weights);
      expect(sum(result.values())).toBe(total);
      weights.forEach((weight, i) => {
        const got = result.get(`p${i}`)!;
        expect(got).toBeGreaterThanOrEqual(0);
        expect(Math.abs(got - (total * weight) / weightSum)).toBeLessThan(1);
      });
    }
  });

  it("rejects input that cannot be split", () => {
    expect(() => apportion(100, [], "s")).toThrow(/at least one/i);
    expect(() => apportion(100, entries([0, 0]), "s")).toThrow(/weight/i);
    expect(() => apportion(100, [{ key: "a", weight: 1 }, { key: "a", weight: 1 }], "s")).toThrow(/duplicate/i);
    expect(() => apportion(100, [{ key: "a", weight: -1 }], "s")).toThrow(/weight/i);
    expect(() => apportion(100, [{ key: "a", weight: 1.5 }], "s")).toThrow(/weight/i);
    expect(() => apportion(-1, entries([1]), "s")).toThrow(/total/i);
    expect(() => apportion(1.5, entries([1]), "s")).toThrow(/total/i);
  });
});
