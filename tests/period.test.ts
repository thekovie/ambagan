import { describe, expect, it } from "vitest";
import { nextPeriod, periodLabel, periodOf, periodStub, recentPeriods } from "@/server/billing/period";

describe("recentPeriods", () => {
  it("lists the current Manila period first, then earlier ones across year boundaries", () => {
    // 16:30Z on Jan 31 is already Feb 1 in Manila: UTC would say January.
    const now = new Date("2026-01-31T16:30:00Z");
    expect(recentPeriods(now, 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });
});

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
