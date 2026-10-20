import { describe, expect, it } from "vitest";
import { firstBillablePeriod, nextPeriod, periodLabel, periodOf, periodStub, recentPeriods } from "@/server/billing/period";

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

describe("firstBillablePeriod", () => {
  const dueDay = 10;
  it("is this month while the due day hasn't passed (the due day itself still counts)", () => {
    expect(firstBillablePeriod(new Date("2026-10-05T04:00:00Z"), dueDay)).toBe("2026-10");
    expect(firstBillablePeriod(new Date("2026-10-10T15:59:00Z"), dueDay)).toBe("2026-10"); // 23:59 on the 10th, Manila
  });
  it("is next month once the due day has passed, so nobody is billed for a month that is already late", () => {
    expect(firstBillablePeriod(new Date("2026-10-10T16:00:00Z"), dueDay)).toBe("2026-11"); // 00:00 on the 11th, Manila
    expect(firstBillablePeriod(new Date("2026-10-20T04:00:00Z"), dueDay)).toBe("2026-11");
  });
  it("rolls over the year, and uses the Manila day not the UTC day", () => {
    expect(firstBillablePeriod(new Date("2026-12-20T04:00:00Z"), dueDay)).toBe("2027-01");
    expect(firstBillablePeriod(new Date("2026-10-31T17:00:00Z"), dueDay)).toBe("2026-11"); // Nov 1 in Manila: still before the 10th
  });
});
