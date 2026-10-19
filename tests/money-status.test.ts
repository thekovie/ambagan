import { describe, expect, it } from "vitest";
import { STATEMENT_STATUSES } from "@/lib/enums";
import { formatMinor, parsePesosToMinor } from "@/lib/money";
import { STATUS_META, statusAction } from "@/lib/status";

describe("formatMinor", () => {
  it("formats centavos as PHP with two decimals", () => {
    expect(formatMinor(5000, "PHP")).toBe("₱50.00");
    expect(formatMinor(123456, "PHP")).toBe("₱1,234.56");
    expect(formatMinor(0, "PHP")).toBe("₱0.00");
  });
});

describe("parsePesosToMinor", () => {
  it("converts user-entered peso strings to integer centavos", () => {
    expect(parsePesosToMinor("50")).toBe(5000);
    expect(parsePesosToMinor("50.5")).toBe(5050);
    expect(parsePesosToMinor("₱1,234.56")).toBe(123456);
    expect(parsePesosToMinor(" 0.07 ")).toBe(7);
  });

  it("avoids floating point drift", () => {
    expect(parsePesosToMinor("1.15")).toBe(115);
    expect(parsePesosToMinor("19.99")).toBe(1999);
  });

  it("rejects invalid, negative or over-precise input", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1..2", "1e3"]) {
      expect(parsePesosToMinor(bad)).toBeNull();
    }
  });
});

describe("STATUS_META", () => {
  it("has a label and icon for every statement status", () => {
    for (const status of STATEMENT_STATUSES) {
      expect(STATUS_META[status].label.length).toBeGreaterThan(0);
      expect(STATUS_META[status].icon).toBeTruthy();
    }
  });
});

describe("statusAction", () => {
  it("maps statuses to the contextual action from the brief", () => {
    expect(statusAction("UNPAID")).toEqual({ kind: "submit", label: "Submit payment" });
    expect(statusAction("OVERDUE")).toEqual({ kind: "submit", label: "Submit payment" });
    expect(statusAction("UNDER_VERIFICATION").label).toBe("View submission");
    expect(statusAction("PAID").label).toBe("View payment details");
    expect(statusAction("CANCELLED").label).toBe("View statement");
  });
});
