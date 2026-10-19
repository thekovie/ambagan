import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, greeting, toLocalInputValue } from "@/lib/dates";

describe("toLocalInputValue", () => {
  it("formats an instant as a datetime-local value in Manila time", () => {
    expect(toLocalInputValue(new Date("2026-10-04T08:25:00Z"))).toBe("2026-10-04T16:25");
    expect(toLocalInputValue(new Date("2026-12-31T16:30:00Z"))).toBe("2027-01-01T00:30");
  });
});

describe("greeting (Manila hour)", () => {
  it("follows the hour in Manila, not the device or UTC", () => {
    expect(greeting(new Date("2026-10-19T21:30:00Z"))).toBe("Good morning"); // 05:30 Manila
    expect(greeting(new Date("2026-10-19T04:00:00Z"))).toBe("Good afternoon"); // 12:00 Manila
    expect(greeting(new Date("2026-10-19T10:00:00Z"))).toBe("Good evening"); // 18:00 Manila
    expect(greeting(new Date("2026-10-19T16:30:00Z"))).toBe("Good evening"); // 00:30 Manila
  });
});
import { dueDateOf, issueDateOf } from "@/server/billing/dates";

describe("issueDateOf / dueDateOf (Asia/Manila, UTC+8, no DST)", () => {
  it("issues at the start of the issue day in Manila", () => {
    expect(issueDateOf("2026-10", 1).toISOString()).toBe("2026-09-30T16:00:00.000Z");
  });

  it("is due at the very end of the due day in Manila", () => {
    expect(dueDateOf("2026-10", 10).toISOString()).toBe("2026-10-10T15:59:59.999Z");
  });

  it("handles year boundaries and short months", () => {
    expect(issueDateOf("2027-01", 1).toISOString()).toBe("2026-12-31T16:00:00.000Z");
    expect(dueDateOf("2027-02", 28).toISOString()).toBe("2027-02-28T15:59:59.999Z");
  });
});

describe("date formatting (Manila time)", () => {
  it("formats a short date with weekday", () => {
    expect(formatDate(new Date("2026-10-10T15:59:59.999Z"))).toBe("Sat, Oct 10");
  });

  it("uses the Manila calendar day, not UTC", () => {
    // 16:00Z is already the next day in Manila.
    expect(formatDate(new Date("2026-10-10T16:00:00.000Z"))).toBe("Sun, Oct 11");
  });

  it("formats date and time", () => {
    expect(formatDateTime(new Date("2026-10-10T15:59:00.000Z"))).toBe("Oct 10, 2026, 11:59 PM");
  });
});
