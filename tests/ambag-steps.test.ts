import { describe, expect, it } from "vitest";
import { STEPS, stepBlocker } from "@/app/admin/ambag/new/steps";

describe("the new ambag steps", () => {
  it("has three steps: the bill, who is in, and the split", () => {
    expect(STEPS.map((s) => s.label)).toEqual(["The bill", "Who's in", "Split & send"]);
  });

  it("asks for a name before leaving the first step", () => {
    expect(stepBlocker(0, { title: "", includedCount: 0 })).toBe("Say what it was for.");
    expect(stepBlocker(0, { title: "   ", includedCount: 3 })).toBe("Say what it was for.");
    expect(stepBlocker(0, { title: "Dinner", includedCount: 0 })).toBeNull();
  });

  it("asks for at least one person before leaving the second step", () => {
    expect(stepBlocker(1, { title: "Dinner", includedCount: 0 })).toBe("Choose who's in.");
    expect(stepBlocker(1, { title: "Dinner", includedCount: 1 })).toBeNull();
  });

  it("never blocks the last step: its own summary says what is missing", () => {
    expect(stepBlocker(2, { title: "", includedCount: 0 })).toBeNull();
  });
});
