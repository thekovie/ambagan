import { beforeEach, describe, expect, it } from "vitest";
import { buildItemsSplitInput, buildSplitInput, computeSplit, type DraftExtra, type DraftItem, type DraftPerson } from "@/lib/split";
import { createBill } from "@/server/bills";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { createTestDb } from "./helpers/db";

const person = (id: string, over: Partial<DraftPerson> = {}): DraftPerson => ({ id, name: id.toUpperCase(), shares: "1", percent: "", amount: "", ...over });

describe("buildSplitInput (what the builder submits)", () => {
  it("builds an equal split from the chosen people", () => {
    expect(buildSplitInput({ method: "EQUAL", totalText: "1,500.50", people: [person("a"), person("b")] })).toEqual({
      input: { v: 1, method: "EQUAL", totalMinor: 150050, participants: ["a", "b"] },
    });
  });

  it("builds shares, percent and exact entries, treating blank percent and amount as zero", () => {
    const people = [person("a", { shares: "2", percent: "50", amount: "30" }), person("b", { shares: "0", percent: "", amount: "" })];
    expect(buildSplitInput({ method: "SHARES", totalText: "100", people })).toEqual({
      input: { v: 1, method: "SHARES", totalMinor: 10000, entries: [{ userId: "a", shares: 2 }, { userId: "b", shares: 0 }] },
    });
    expect(buildSplitInput({ method: "PERCENT", totalText: "100", people })).toEqual({
      input: { v: 1, method: "PERCENT", totalMinor: 10000, entries: [{ userId: "a", bp: 5000 }, { userId: "b", bp: 0 }] },
    });
    expect(buildSplitInput({ method: "EXACT", totalText: "100", people })).toEqual({
      input: { v: 1, method: "EXACT", totalMinor: 10000, entries: [{ userId: "a", amountMinor: 3000 }, { userId: "b", amountMinor: 0 }] },
    });
  });

  it("says what is missing instead of building something half-formed", () => {
    const people = [person("a")];
    expect(buildSplitInput({ method: "EQUAL", totalText: "", people })).toEqual({ waiting: "Enter the total to see the split." });
    expect(buildSplitInput({ method: "EQUAL", totalText: "100", people: [] })).toEqual({ waiting: "Choose who is in." });
    expect(buildSplitInput({ method: "SHARES", totalText: "100", people: [person("a", { shares: "x" })] })).toEqual({ waiting: "Enter shares for A (a whole number, 0 to 99)." });
    expect(buildSplitInput({ method: "PERCENT", totalText: "100", people: [person("a", { percent: "abc" })] })).toEqual({ waiting: "Check the percentage for A." });
    expect(buildSplitInput({ method: "EXACT", totalText: "100", people: [person("a", { amount: "1e3" })] })).toEqual({ waiting: "Check the amount for A." });
  });

  it("tells someone their total isn't an amount, rather than asking for it again", () => {
    for (const bad of ["1,50", "1e3", "0.001", "-5", "abc", "9".repeat(30)]) {
      expect(buildSplitInput({ method: "EQUAL", totalText: bad, people: [person("a")] }), bad).toEqual({ waiting: "That total isn't an amount. Use pesos, like 1,500.50." });
    }
  });
});

const item = (id: string, over: Partial<DraftItem> = {}): DraftItem => ({ id, label: `Item ${id}`, priceText: "100", assignees: ["a"], ...over });
const extra = (id: string, over: Partial<DraftExtra> = {}): DraftExtra => ({ id, kind: "TIP", label: "", mode: "AMOUNT", valueText: "10", allocate: "PROPORTIONAL", ...over });

describe("buildItemsSplitInput (the itemised form)", () => {
  const people = [person("a"), person("b")];

  it("builds items and extras, reading pesos and percentages", () => {
    const draft = buildItemsSplitInput({
      people,
      items: [item("i1", { label: " Pizza ", priceText: "1,250.50", assignees: ["a", "b"] }), item("i2", { label: "Beer", priceText: "90", assignees: ["b"] })],
      extras: [extra("e1", { kind: "SERVICE", mode: "PERCENT", valueText: "10" }), extra("e2", { kind: "DELIVERY", mode: "AMOUNT", valueText: "49.50", allocate: "EQUAL" }), extra("e3", { kind: "OTHER", label: "Corkage", valueText: "5" })],
      receiptText: "",
    });
    expect(draft).toEqual({
      input: {
        v: 1,
        method: "ITEMS",
        items: [
          { id: "i1", label: "Pizza", priceMinor: 125050, assignees: ["a", "b"] },
          { id: "i2", label: "Beer", priceMinor: 9000, assignees: ["b"] },
        ],
        extras: [
          { id: "e1", kind: "SERVICE", mode: "PERCENT", bp: 1000, allocate: "PROPORTIONAL" },
          { id: "e2", kind: "DELIVERY", mode: "AMOUNT", valueMinor: 4950, allocate: "EQUAL" },
          { id: "e3", kind: "OTHER", label: "Corkage", mode: "AMOUNT", valueMinor: 500, allocate: "PROPORTIONAL" },
        ],
      },
    });
  });

  it("includes the receipt total when one is typed, and nothing when it is blank", () => {
    const base = { people, items: [item("i1")], extras: [] };
    expect((buildItemsSplitInput({ ...base, receiptText: "" }) as { input: { receiptTotalMinor?: number } }).input.receiptTotalMinor).toBeUndefined();
    expect((buildItemsSplitInput({ ...base, receiptText: "1,000" }) as { input: { receiptTotalMinor?: number } }).input.receiptTotalMinor).toBe(100000);
    expect(buildItemsSplitInput({ ...base, receiptText: "abc" })).toEqual({ waiting: "Check the total on the receipt." });
  });

  it("ignores people who are no longer in the split, and says when an item is left with nobody", () => {
    const draft = buildItemsSplitInput({ people: [person("a")], items: [item("i1", { assignees: ["a", "gone"] })], extras: [], receiptText: "" });
    expect((draft as { input: { items: { assignees: string[] }[] } }).input.items[0].assignees).toEqual(["a"]);
    expect(buildItemsSplitInput({ people: [person("a")], items: [item("i1", { label: "Soup", assignees: ["gone"] })], extras: [], receiptText: "" })).toEqual({ waiting: 'Choose who shared "Soup".' });
  });

  it("says what is missing instead of building something half-formed", () => {
    const base = { people, items: [item("i1")], extras: [], receiptText: "" };
    expect(buildItemsSplitInput({ ...base, items: [] })).toEqual({ waiting: "Add at least one item." });
    expect(buildItemsSplitInput({ ...base, people: [] })).toEqual({ waiting: "Choose who is in." });
    expect(buildItemsSplitInput({ ...base, items: [item("i1", { label: "  " })] })).toEqual({ waiting: "Give item 1 a name." });
    expect(buildItemsSplitInput({ ...base, items: [item("i1", { label: "Soup", priceText: "" })] })).toEqual({ waiting: 'Enter the price of "Soup".' });
    expect(buildItemsSplitInput({ ...base, items: [item("i1", { label: "Soup", priceText: "free" })] })).toEqual({ waiting: 'Check the price of "Soup".' });
    expect(buildItemsSplitInput({ ...base, extras: [extra("e1", { kind: "TIP", valueText: "" })] })).toEqual({ waiting: "Enter an amount for the tip." });
    expect(buildItemsSplitInput({ ...base, extras: [extra("e1", { kind: "DISCOUNT", mode: "PERCENT", valueText: "abc" })] })).toEqual({ waiting: "Check the percentage for the discount." });
    expect(buildItemsSplitInput({ ...base, extras: [extra("e1", { kind: "OTHER", label: "Corkage", valueText: "x" })] })).toEqual({ waiting: "Check the amount for Corkage." });
  });

  it("always shares a discount in proportion, whatever the form says", () => {
    const draft = buildItemsSplitInput({ people, items: [item("i1")], extras: [extra("e1", { kind: "DISCOUNT", allocate: "EQUAL" })], receiptText: "" });
    expect((draft as { input: { extras: { allocate: string }[] } }).input.extras[0].allocate).toBe("PROPORTIONAL");
  });

  it("gives the same amounts in the preview and in the saved bill", () => {
    const db = createTestDb();
    const admin = db.insert(s.users).values({ email: "admin@example.com", name: "Admin", role: "ADMIN" }).returning().get();
    const [x, y, z] = ["ana", "ben", "cy"].map((n) => db.insert(s.users).values({ email: `${n}@example.com`, name: n }).returning().get());
    const form = {
      people: [person(admin.id), person(x.id), person(y.id), person(z.id)],
      items: [
        item("i1", { label: "Pizza", priceText: "777.77", assignees: [admin.id, x.id, y.id] }),
        item("i2", { label: "Beer", priceText: "333.33", assignees: [x.id, z.id] }),
        item("i3", { label: "Salad", priceText: "99.99", assignees: [z.id] }),
      ],
      extras: [extra("e1", { kind: "SERVICE", mode: "PERCENT", valueText: "10" }), extra("e2", { kind: "DELIVERY", valueText: "99.01", allocate: "EQUAL" }), extra("e3", { kind: "DISCOUNT", mode: "PERCENT", valueText: "5" })],
      receiptText: "",
    };
    const draft = buildItemsSplitInput(form);
    if (!("input" in draft)) throw new Error(draft.waiting);
    const billId = crypto.randomUUID();
    const preview = computeSplit(draft.input, billId);
    const saved = createBill(db, { billId, title: "Dinner", dueDate: "2099-01-01", split: draft.input, actorId: admin.id });
    expect(preview.ok && saved.ok).toBe(true);
    if (preview.ok && saved.ok) expect(saved.bill.splitResult).toEqual(preview.result);
  });
});

describe("the preview and the saved bill always agree", () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
  });

  it("gives the same amounts for every method, odd centavos and an admin outside the split", () => {
    const admin = db.insert(s.users).values({ email: "admin@example.com", name: "Admin", role: "ADMIN" }).returning().get();
    const friends = ["ana", "ben", "cy", "dee", "eli"].map((n) => db.insert(s.users).values({ email: `${n}@example.com`, name: n }).returning().get());
    const cases: { method: "EQUAL" | "SHARES" | "PERCENT" | "EXACT"; totalText: string; people: DraftPerson[] }[] = [
      { method: "EQUAL", totalText: "100", people: friends.slice(0, 3).map((f) => person(f.id)) },
      { method: "EQUAL", totalText: "999.99", people: [admin, ...friends].map((f) => person(f.id)) },
      { method: "SHARES", totalText: "1,234.56", people: friends.map((f, i) => person(f.id, { shares: String(i + 1) })) },
      { method: "PERCENT", totalText: "777.77", people: [person(friends[0].id, { percent: "33.33" }), person(friends[1].id, { percent: "33.33" }), person(friends[2].id, { percent: "33.34" })] },
      { method: "EXACT", totalText: "50", people: [person(friends[0].id, { amount: "20.10" }), person(friends[1].id, { amount: "29.90" })] },
    ];

    for (const c of cases) {
      const billId = crypto.randomUUID();
      const draft = buildSplitInput(c);
      if (!("input" in draft)) throw new Error(draft.waiting);
      const preview = computeSplit(draft.input, billId);
      const saved = createBill(db, { billId, title: "Check", dueDate: "2099-01-01", split: draft.input, actorId: admin.id });
      expect(preview.ok && saved.ok).toBe(true);
      if (!preview.ok || !saved.ok) continue;
      expect(saved.bill.splitResult).toEqual(preview.result);
      // And what each friend is actually billed is what the preview showed them.
      for (const st of saved.statements) {
        expect(st.amountMinor).toBe(preview.result.shares.find((sh) => sh.userId === st.userId)!.amountMinor);
      }
    }
  });
});
