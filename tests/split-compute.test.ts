import { describe, expect, it } from "vitest";
import { computeSplit, parsePercentToBp, SPLIT_LIMITS, type SplitOutcome } from "@/lib/split";

const ok = (outcome: SplitOutcome) => {
  if (!outcome.ok) throw new Error(`expected a split, got ${JSON.stringify(outcome.issues)}`);
  return outcome.result;
};
const failed = (outcome: SplitOutcome) => {
  if (outcome.ok) throw new Error("expected the split to be rejected");
  return outcome.issues;
};
const amountOf = (outcome: SplitOutcome, userId: string) =>
  ok(outcome).shares.find((s) => s.userId === userId)!.amountMinor;
const totalOfShares = (outcome: SplitOutcome) => ok(outcome).shares.reduce((a, s) => a + s.amountMinor, 0);

describe("parsePercentToBp", () => {
  it("reads percentages with up to two decimals as basis points", () => {
    expect(parsePercentToBp("50")).toBe(5000);
    expect(parsePercentToBp("33.33")).toBe(3333);
    expect(parsePercentToBp("12.5")).toBe(1250);
    expect(parsePercentToBp("100")).toBe(10000);
    expect(parsePercentToBp("0")).toBe(0);
    expect(parsePercentToBp(" 7.05% ")).toBe(705);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "abc", "-5", "100.01", "101", "1.234", "1,5", "5.%"]) {
      expect(parsePercentToBp(bad)).toBeNull();
    }
  });
});

describe("EQUAL", () => {
  it("splits evenly, with the leftover centavo going to exactly one person", () => {
    const outcome = computeSplit({ v: 1, method: "EQUAL", totalMinor: 10000, participants: ["a", "b", "c"] }, "bill-1");
    expect(totalOfShares(outcome)).toBe(10000);
    expect(ok(outcome).shares.map((s) => s.amountMinor).sort()).toEqual([3333, 3333, 3334]);
    expect(ok(outcome).method).toBe("EQUAL");
    expect(ok(outcome).totalMinor).toBe(10000);
  });

  it("keeps the order people were listed in and explains each share", () => {
    const result = ok(computeSplit({ v: 1, method: "EQUAL", totalMinor: 9000, participants: ["z", "a", "m"] }, "x"));
    expect(result.shares.map((s) => s.userId)).toEqual(["z", "a", "m"]);
    expect(result.shares[0].lines).toEqual([{ kind: "BASE", label: "Your share", amountMinor: 3000, note: "Split equally between 3" }]);
  });

  it("allows a single person", () => {
    expect(amountOf(computeSplit({ v: 1, method: "EQUAL", totalMinor: 5000, participants: ["a"] }, "s"), "a")).toBe(5000);
  });

  it("rejects an empty list, repeated people, and a total that is zero or too large", () => {
    expect(failed(computeSplit({ v: 1, method: "EQUAL", totalMinor: 100, participants: [] }, "s"))[0].code).toBe("NO_PARTICIPANTS");
    expect(failed(computeSplit({ v: 1, method: "EQUAL", totalMinor: 100, participants: ["a", "a"] }, "s"))[0].code).toBe("DUPLICATE_PARTICIPANT");
    expect(failed(computeSplit({ v: 1, method: "EQUAL", totalMinor: 0, participants: ["a"] }, "s"))[0].code).toBe("TOTAL_NOT_POSITIVE");
    expect(failed(computeSplit({ v: 1, method: "EQUAL", totalMinor: SPLIT_LIMITS.maxTotalMinor + 1, participants: ["a"] }, "s"))[0].code).toBe(
      "TOTAL_TOO_LARGE",
    );
  });

  it("rejects more people than the limit", () => {
    const many = Array.from({ length: SPLIT_LIMITS.maxParticipants + 1 }, (_, i) => `u${i}`);
    expect(failed(computeSplit({ v: 1, method: "EQUAL", totalMinor: 100_000, participants: many }, "s"))[0].code).toBe("TOO_MANY_PARTICIPANTS");
  });

  it("rejects input of the wrong shape with a plain message", () => {
    const issues = failed(computeSplit({ v: 1, method: "EQUAL", totalMinor: "a lot", participants: ["a"] }, "s"));
    expect(issues[0].code).toBe("INVALID_INPUT");
    expect(computeSplit(null, "s").ok).toBe(false);
    expect(computeSplit({ v: 2, method: "EQUAL" }, "s").ok).toBe(false);
  });
});

describe("SHARES", () => {
  it("weights people by their shares (a couple counts as two)", () => {
    const outcome = computeSplit(
      { v: 1, method: "SHARES", totalMinor: 9000, entries: [{ userId: "couple", shares: 2 }, { userId: "solo", shares: 1 }] },
      "s",
    );
    expect(amountOf(outcome, "couple")).toBe(6000);
    expect(amountOf(outcome, "solo")).toBe(3000);
    expect(ok(outcome).shares[0].lines[0].note).toBe("2 of 3 shares");
  });

  it("keeps someone with zero shares in the list but charges them nothing", () => {
    const outcome = computeSplit(
      { v: 1, method: "SHARES", totalMinor: 1000, entries: [{ userId: "a", shares: 1 }, { userId: "b", shares: 0 }] },
      "s",
    );
    expect(amountOf(outcome, "a")).toBe(1000);
    expect(amountOf(outcome, "b")).toBe(0);
  });

  it("needs at least one share overall and stays within the limit per person", () => {
    expect(failed(computeSplit({ v: 1, method: "SHARES", totalMinor: 1000, entries: [{ userId: "a", shares: 0 }] }, "s"))[0].code).toBe("SHARES_NO_WEIGHT");
    expect(failed(computeSplit({ v: 1, method: "SHARES", totalMinor: 1000, entries: [{ userId: "a", shares: 100 }] }, "s"))[0].code).toBe("INVALID_INPUT");
    expect(failed(computeSplit({ v: 1, method: "SHARES", totalMinor: 1000, entries: [{ userId: "a", shares: 1.5 }] }, "s"))[0].code).toBe("INVALID_INPUT");
  });
});

describe("PERCENT", () => {
  it("splits by percentage when it adds up to exactly 100", () => {
    const outcome = computeSplit(
      { v: 1, method: "PERCENT", totalMinor: 20000, entries: [{ userId: "a", bp: 5000 }, { userId: "b", bp: 2500 }, { userId: "c", bp: 2500 }] },
      "s",
    );
    expect(amountOf(outcome, "a")).toBe(10000);
    expect(amountOf(outcome, "b")).toBe(5000);
    expect(ok(outcome).shares[0].lines[0].note).toBe("50% of the total");
  });

  it("rejects three people at 33.33% and says how much is left", () => {
    const issues = failed(
      computeSplit({ v: 1, method: "PERCENT", totalMinor: 10000, entries: ["a", "b", "c"].map((userId) => ({ userId, bp: 3333 })) }, "s"),
    );
    expect(issues[0]).toMatchObject({ code: "PERCENT_NOT_100", bp: 1 });
    expect(issues[0].message).toMatch(/0\.01%/);
  });

  it("says when the percentages go over 100", () => {
    const issues = failed(
      computeSplit({ v: 1, method: "PERCENT", totalMinor: 10000, entries: [{ userId: "a", bp: 6000 }, { userId: "b", bp: 5000 }] }, "s"),
    );
    expect(issues[0]).toMatchObject({ code: "PERCENT_NOT_100", bp: -1000 });
    expect(issues[0].message).toMatch(/10% too much/);
  });

  it("always adds up to the total after rounding", () => {
    const outcome = computeSplit(
      { v: 1, method: "PERCENT", totalMinor: 9999, entries: [{ userId: "a", bp: 3334 }, { userId: "b", bp: 3333 }, { userId: "c", bp: 3333 }] },
      "s",
    );
    expect(totalOfShares(outcome)).toBe(9999);
  });
});

describe("EXACT", () => {
  it("accepts amounts that add up to the total", () => {
    const outcome = computeSplit(
      { v: 1, method: "EXACT", totalMinor: 10000, entries: [{ userId: "a", amountMinor: 6500 }, { userId: "b", amountMinor: 3500 }] },
      "s",
    );
    expect(amountOf(outcome, "a")).toBe(6500);
    expect(ok(outcome).shares[0].lines[0].note).toBe("Set by the admin");
  });

  it("rejects amounts that do not add up and says by how much", () => {
    const short = failed(
      computeSplit({ v: 1, method: "EXACT", totalMinor: 10000, entries: [{ userId: "a", amountMinor: 6000 }, { userId: "b", amountMinor: 3500 }] }, "s"),
    );
    expect(short[0]).toMatchObject({ code: "EXACT_MISMATCH", amountMinor: 500 });
    expect(short[0].message).toMatch(/₱5\.00 left/);
    const over = failed(
      computeSplit({ v: 1, method: "EXACT", totalMinor: 10000, entries: [{ userId: "a", amountMinor: 7000 }, { userId: "b", amountMinor: 3500 }] }, "s"),
    );
    expect(over[0]).toMatchObject({ code: "EXACT_MISMATCH", amountMinor: -500 });
    expect(over[0].message).toMatch(/₱5\.00 too much/);
  });

  it("rejects negative amounts", () => {
    expect(
      failed(computeSplit({ v: 1, method: "EXACT", totalMinor: 100, entries: [{ userId: "a", amountMinor: 200 }, { userId: "b", amountMinor: -100 }] }, "s"))[0].code,
    ).toBe("INVALID_INPUT");
  });
});

describe("ITEMS", () => {
  const pizzaNight = {
    v: 1,
    method: "ITEMS",
    items: [
      { id: "pizza", label: "Pizza", priceMinor: 60000, assignees: ["ana", "ben", "cy"] },
      { id: "beer", label: "Beer", priceMinor: 9000, assignees: ["ana"] },
      { id: "salad", label: "Salad", priceMinor: 30000, assignees: ["ben", "cy"] },
    ],
    extras: [],
  };

  it("charges each person for what they shared and sums to the items", () => {
    const outcome = computeSplit(pizzaNight, "s");
    expect(amountOf(outcome, "ana")).toBe(20000 + 9000);
    expect(amountOf(outcome, "ben")).toBe(20000 + 15000);
    expect(amountOf(outcome, "cy")).toBe(20000 + 15000);
    expect(ok(outcome).totalMinor).toBe(99000);
    expect(ok(outcome).shares[0].lines.map((l) => [l.label, l.amountMinor, l.note])).toEqual([
      ["Pizza", 20000, "Shared by 3"],
      ["Beer", 9000, undefined],
    ]);
  });

  it("adds service charge as a percentage of the items, in proportion to what each person had", () => {
    const outcome = computeSplit(
      { ...pizzaNight, extras: [{ id: "svc", kind: "SERVICE", mode: "PERCENT", bp: 1000, allocate: "PROPORTIONAL" }] },
      "s",
    );
    expect(ok(outcome).totalMinor).toBe(99000 + 9900);
    expect(amountOf(outcome, "ana")).toBe(29000 + 2900);
    expect(amountOf(outcome, "ben")).toBe(35000 + 3500);
    expect(ok(outcome).shares[0].lines.at(-1)).toEqual({ kind: "EXTRA", label: "Service charge", amountMinor: 2900, note: "10% of the items" });
  });

  it("splits a delivery fee equally between everyone", () => {
    const outcome = computeSplit(
      { ...pizzaNight, extras: [{ id: "del", kind: "DELIVERY", mode: "AMOUNT", valueMinor: 9000, allocate: "EQUAL" }] },
      "s",
    );
    expect(amountOf(outcome, "ana")).toBe(29000 + 3000);
    expect(amountOf(outcome, "ben")).toBe(35000 + 3000);
  });

  it("takes a discount off in proportion", () => {
    const outcome = computeSplit(
      { ...pizzaNight, extras: [{ id: "promo", kind: "DISCOUNT", mode: "AMOUNT", valueMinor: 9900, allocate: "PROPORTIONAL" }] },
      "s",
    );
    expect(ok(outcome).totalMinor).toBe(89100);
    expect(amountOf(outcome, "ana")).toBe(29000 - 2900);
    expect(ok(outcome).shares[0].lines.at(-1)).toMatchObject({ kind: "EXTRA", label: "Discount", amountMinor: -2900 });
  });

  it("rejects a bill that is discounted down to nothing, since there is nothing to collect", () => {
    const issues = failed(
      computeSplit({ ...pizzaNight, extras: [{ id: "promo", kind: "DISCOUNT", mode: "PERCENT", bp: 10000, allocate: "PROPORTIONAL" }] }, "s"),
    );
    expect(issues[0].code).toBe("TOTAL_NOT_POSITIVE");
  });

  it("never leaves anyone negative, even with several discounts rounding against the same person", () => {
    // 2 centavos shared by two people, then two 33.33% discounts: each discount alone rounds one centavo against u0.
    const tiny = computeSplit(
      {
        v: 1,
        method: "ITEMS",
        items: [{ id: "i0", label: "x", priceMinor: 2, assignees: ["u2", "u0"] }],
        extras: [
          { id: "e0", kind: "DISCOUNT", mode: "PERCENT", bp: 3333, allocate: "PROPORTIONAL" },
          { id: "e1", kind: "DISCOUNT", mode: "PERCENT", bp: 3333, allocate: "PROPORTIONAL" },
        ],
      },
      "s",
    );
    if (tiny.ok) for (const share of tiny.result.shares) expect(share.amountMinor).toBeGreaterThanOrEqual(0);

    for (let n = 0; n < 400; n++) {
      const outcome = computeSplit(
        {
          v: 1,
          method: "ITEMS",
          items: [
            { id: "a", label: "A", priceMinor: 1 + (n % 7), assignees: ["u0", "u1", "u2"] },
            { id: "b", label: "B", priceMinor: 1 + (n % 5), assignees: ["u1", "u3"] },
          ],
          extras: [
            { id: "d1", kind: "DISCOUNT", mode: "PERCENT", bp: 2500 + (n % 40) * 100, allocate: "PROPORTIONAL" },
            { id: "d2", kind: "DISCOUNT", mode: "PERCENT", bp: 3333, allocate: "PROPORTIONAL" },
            { id: "d3", kind: "DISCOUNT", mode: "AMOUNT", valueMinor: 1, allocate: "PROPORTIONAL" },
          ],
        },
        `tiny-${n}`,
      );
      if (!outcome.ok) continue;
      expect(totalOfShares(outcome)).toBe(outcome.result.totalMinor);
      for (const share of outcome.result.shares) {
        expect(share.amountMinor).toBeGreaterThanOrEqual(0);
        expect(share.lines.reduce((sum, line) => sum + line.amountMinor, 0)).toBe(share.amountMinor);
      }
    }
  });

  it("applies the size limit to what the bill adds up to before discounts", () => {
    const big = [
      { id: "a", label: "A", priceMinor: SPLIT_LIMITS.maxTotalMinor, assignees: ["x"] },
      { id: "b", label: "B", priceMinor: SPLIT_LIMITS.maxTotalMinor, assignees: ["y"] },
    ];
    const discount = { id: "d", kind: "DISCOUNT", mode: "PERCENT", bp: 6000, allocate: "PROPORTIONAL" };
    expect(failed(computeSplit({ v: 1, method: "ITEMS", items: big, extras: [discount] }, "s"))[0].code).toBe("TOTAL_TOO_LARGE");
  });

  it("does not let an item and an extra share an id", () => {
    const outcome = computeSplit(
      {
        v: 1,
        method: "ITEMS",
        items: [{ id: "same", label: "Soup", priceMinor: 100, assignees: ["a"] }],
        extras: [{ id: "same", kind: "TIP", mode: "AMOUNT", valueMinor: 10, allocate: "EQUAL" }],
      },
      "s",
    );
    expect(failed(outcome)[0].code).toBe("DUPLICATE_ID");
  });

  it("rejects a receipt total that is negative", () => {
    expect(failed(computeSplit({ ...pizzaNight, receiptTotalMinor: -500 }, "s"))[0].code).toBe("INVALID_INPUT");
  });

  it("copes with ids like __proto__ and constructor", () => {
    const outcome = computeSplit(
      { v: 1, method: "ITEMS", items: [{ id: "__proto__", label: "Soup", priceMinor: 100, assignees: ["constructor", "toString"] }], extras: [] },
      "s",
    );
    expect(totalOfShares(outcome)).toBe(100);
    expect(amountOf(outcome, "constructor") + amountOf(outcome, "toString")).toBe(100);
  });

  it("rejects a discount bigger than the items, or one split equally", () => {
    expect(
      failed(computeSplit({ ...pizzaNight, extras: [{ id: "d", kind: "DISCOUNT", mode: "AMOUNT", valueMinor: 99001, allocate: "PROPORTIONAL" }] }, "s"))[0].code,
    ).toBe("DISCOUNT_TOO_BIG");
    expect(
      failed(computeSplit({ ...pizzaNight, extras: [{ id: "d", kind: "DISCOUNT", mode: "AMOUNT", valueMinor: 100, allocate: "EQUAL" }] }, "s"))[0].code,
    ).toBe("DISCOUNT_NOT_PROPORTIONAL");
  });

  it("checks the receipt total when one is given", () => {
    expect(totalOfShares(computeSplit({ ...pizzaNight, receiptTotalMinor: 99000 }, "s"))).toBe(99000);
    const issues = failed(computeSplit({ ...pizzaNight, receiptTotalMinor: 99500 }, "s"));
    expect(issues[0]).toMatchObject({ code: "RECEIPT_MISMATCH", amountMinor: 500 });
    expect(issues[0].message).toMatch(/₱5\.00/);
  });

  it("needs items and people on every item", () => {
    expect(failed(computeSplit({ v: 1, method: "ITEMS", items: [], extras: [] }, "s"))[0].code).toBe("NO_ITEMS");
    expect(
      failed(computeSplit({ v: 1, method: "ITEMS", items: [{ id: "i", label: "Soup", priceMinor: 100, assignees: [] }], extras: [] }, "s"))[0].code,
    ).toBe("ITEM_NO_ASSIGNEES");
  });

  it("enforces the limits on items and extras", () => {
    const items = Array.from({ length: SPLIT_LIMITS.maxItems + 1 }, (_, i) => ({ id: `i${i}`, label: "x", priceMinor: 100, assignees: ["a"] }));
    expect(failed(computeSplit({ v: 1, method: "ITEMS", items, extras: [] }, "s"))[0].code).toBe("TOO_MANY_ITEMS");
    const extras = Array.from({ length: SPLIT_LIMITS.maxExtras + 1 }, (_, i) => ({ id: `e${i}`, kind: "TIP", mode: "AMOUNT", valueMinor: 1, allocate: "EQUAL" }));
    expect(failed(computeSplit({ ...pizzaNight, extras }, "s"))[0].code).toBe("TOO_MANY_EXTRAS");
  });

  it("is the same on every run and always adds up exactly, whatever the odd centavos", () => {
    for (let n = 0; n < 200; n++) {
      const input = {
        v: 1,
        method: "ITEMS",
        items: [
          { id: "a", label: "A", priceMinor: 10000 + n, assignees: ["u1", "u2", "u3"] },
          { id: "b", label: "B", priceMinor: 7777 + n * 3, assignees: ["u2", "u3", "u4"] },
          { id: "c", label: "C", priceMinor: 333 + n, assignees: ["u1", "u4"] },
        ],
        extras: [
          { id: "t", kind: "TAX", mode: "PERCENT", bp: 1200, allocate: "PROPORTIONAL" },
          { id: "tip", kind: "TIP", mode: "AMOUNT", valueMinor: 5555, allocate: "PROPORTIONAL" },
          { id: "dl", kind: "DELIVERY", mode: "AMOUNT", valueMinor: 9901, allocate: "EQUAL" },
          { id: "dc", kind: "DISCOUNT", mode: "PERCENT", bp: 500, allocate: "PROPORTIONAL" },
        ],
      };
      const first = computeSplit(input, `bill-${n}`);
      const again = computeSplit(input, `bill-${n}`);
      expect(first).toEqual(again);
      expect(totalOfShares(first)).toBe(ok(first).totalMinor);
      for (const share of ok(first).shares) {
        expect(share.amountMinor).toBeGreaterThanOrEqual(0);
        expect(share.lines.reduce((a, l) => a + l.amountMinor, 0)).toBe(share.amountMinor);
      }
    }
  });
});
