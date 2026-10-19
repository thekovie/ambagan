import { describe, expect, it } from "vitest";
import { nextPeriod, periodLabel, periodOf, periodStub } from "@/server/billing/period";

describe("periodOf (Asia/Manila)", () => {
  it("uses the Manila calendar month, not UTC", () => {
    expect(periodOf(new Date("2026-09-30T16:00:00Z"))).toBe("2026-10"); // Oct 1 00:00 Manila
    expect(periodOf(new Date("2026-09-30T15:59:59Z"))).toBe("2026-09"); // Sep 30 23:59:59 Manila
    expect(periodOf(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01");
  });
});

describe("nextPeriod", () => {
  it("advances months and rolls the year", () => {
    expect(nextPeriod("2026-10")).toBe("2026-11");
    expect(nextPeriod("2026-12")).toBe("2027-01");
  });
});

describe("labels", () => {
  it("formats the long label and three-letter stub", () => {
    expect(periodLabel("2026-10")).toBe("October 2026");
    expect(periodStub("2026-03")).toBe("MAR");
  });
});
