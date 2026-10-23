import { describe, expect, it } from "vitest";
import { STEPS, TOTAL_ERROR, stepBlocker, totalProblem } from "@/app/admin/ambag/new/steps";

describe("the new ambag steps", () => {
  it("has three steps: the bill, who is in, and the split", () => {
    expect(STEPS.map((s) => s.label)).toEqual(["The bill", "Who's in", "Split"]);
  });

  it("asks for a name before leaving the first step", () => {
    expect(stepBlocker(0, { title: "", includedCount: 0, method: "EQUAL", totalText: "" })).toBe("Say what it was for.");
    expect(stepBlocker(0, { title: "   ", includedCount: 3, method: "EQUAL", totalText: "" })).toBe("Say what it was for.");
    expect(stepBlocker(0, { title: "Dinner", includedCount: 0, method: "EQUAL", totalText: "" })).toBeNull();
  });

  it("asks for at least one person before leaving the second step", () => {
    expect(stepBlocker(1, { title: "Dinner", includedCount: 0, method: "EQUAL", totalText: "" })).toBe("Choose who's in.");
    expect(stepBlocker(1, { title: "Dinner", includedCount: 1, method: "EQUAL", totalText: "" })).toBeNull();
  });

  it("never blocks the last step: its own summary says what is missing", () => {
    expect(stepBlocker(2, { title: "", includedCount: 0, method: "EQUAL", totalText: "" })).toBeNull();
  });

  it("stops step 1 on a total that isn't an amount, where the field is, and lets a blank or valid one through", () => {
    const bill = (totalText: string, method = "EQUAL") => stepBlocker(0, { title: "Dinner", includedCount: 0, method, totalText });
    expect(bill("1,5oo")).toBe(TOTAL_ERROR);
    expect(bill("abc")).toBe(TOTAL_ERROR);
    expect(bill("1,500.50")).toBeNull();
    expect(bill("")).toBeNull();
    // An itemised bill adds up from its items, so whatever is left in the total box is ignored.
    expect(bill("abc", "ITEMS")).toBeNull();
    expect(totalProblem("PERCENT", "12.345")).toBe(TOTAL_ERROR);
  });
});
