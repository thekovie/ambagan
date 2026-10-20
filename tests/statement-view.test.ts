import { describe, expect, it } from "vitest";
import { effectiveStatus, stickerProps, statementDateLabel } from "@/lib/statement-view";

const base = {
  reference: "SPOT-202610-A1B2C3",
  period: "2026-10",
  status: "UNPAID" as const,
  subscriptionName: "Spotify",
  amountMinor: 5000,
  currency: "PHP",
  dueAt: new Date("2026-10-10T15:59:59.999Z"),
  cancelledAt: null as Date | null,
};

describe("statementDateLabel", () => {
  it("says what the date means for each status", () => {
    expect(statementDateLabel(base)).toBe("Due Sat, Oct 10");
    expect(statementDateLabel({ ...base, status: "OVERDUE" })).toBe("Was due Sat, Oct 10");
    expect(statementDateLabel({ ...base, status: "UNDER_VERIFICATION" })).toBe("Awaiting verification");
    expect(statementDateLabel({ ...base, status: "PAID" })).toBe("Settled");
    expect(statementDateLabel({ ...base, status: "CANCELLED", cancelledAt: new Date("2026-10-03T02:00:00Z") })).toBe("Cancelled Sat, Oct 3");
  });
});

describe("effectiveStatus", () => {
  const justAfterDue = new Date("2026-10-10T16:00:00Z");
  const justBeforeDue = new Date("2026-10-10T15:59:00Z");

  it("shows an unpaid statement as overdue as soon as its due day has ended", () => {
    expect(effectiveStatus(base, justBeforeDue)).toBe("UNPAID");
    expect(effectiveStatus(base, justAfterDue)).toBe("OVERDUE");
  });

  it("never changes any other status", () => {
    for (const status of ["UNDER_VERIFICATION", "PAID", "CANCELLED", "OVERDUE"] as const) {
      expect(effectiveStatus({ ...base, status }, justAfterDue)).toBe(status);
    }
  });

  it("is applied by stickerProps so stickers read correctly before the daily job runs", () => {
    expect(stickerProps(base, justAfterDue)).toMatchObject({ status: "OVERDUE", dateLabel: "Was due Sat, Oct 10" });
  });
});

describe("stickerProps", () => {
  it("maps a statement to the sticker's display fields", () => {
    expect(stickerProps(base, new Date("2026-10-05T00:00:00Z"))).toEqual({
      status: "UNPAID",
      subscriptionName: "Spotify",
      periodLabel: "October 2026",
      amountMinor: 5000,
      currency: "PHP",
      dateLabel: "Due Sat, Oct 10",
      reference: "SPOT-202610-A1B2C3",
    });
  });
});
