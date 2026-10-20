import { beforeEach, describe, expect, it } from "vitest";
import { buildSplitInput, computeSplit, type DraftPerson } from "@/lib/split";
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
