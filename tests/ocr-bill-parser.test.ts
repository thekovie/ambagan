import { describe, expect, it } from "vitest";
import { parseBillReceipt } from "@/lib/ocr/parse-bill";

const lines = (...rows: string[]) => rows.join("\n");

const RESTAURANT = lines(
  "GERRY'S GRILL",
  "Table 12   10/22/2026 7:45 PM",
  "Sizzling Sisig          350.00",
  "2 x Calamansi Juice     120.00",
  "Pork BBQ                285.50",
  "Garlic Rice              60.00",
  "SUBTOTAL                815.50",
  "Service Charge 10%       81.55",
  "TOTAL                   897.05",
  "CASH                  1,000.00",
  "CHANGE                  102.95",
);

const GROCERY = lines(
  "SM SUPERMARKET",
  "Fresh Milk 1L      95.00",
  "Bread Loaf         58.25",
  "Eggs 12s          110.00",
  "TOTAL ITEMS: 3",
  "TOTAL             263.25",
  "VATable Sales     235.04",
  "VAT 12%            28.21",
  "CASH              300.00",
  "CHANGE             36.75",
);

describe("parseBillReceipt: items", () => {
  it("reads item lines as a label and the price at the end", () => {
    const parsed = parseBillReceipt(RESTAURANT);
    expect(parsed.items).toEqual([
      { label: "Sizzling Sisig", priceMinor: 35000 },
      { label: "Calamansi Juice ×2", priceMinor: 12000 },
      { label: "Pork BBQ", priceMinor: 28550 },
      { label: "Garlic Rice", priceMinor: 6000 },
    ]);
    expect(parsed.totalMinor).toBe(89705);
  });

  it("does not treat the header, subtotal, total, cash or change lines as items", () => {
    const labels = parseBillReceipt(RESTAURANT).items.map((i) => i.label);
    expect(labels.join(" ")).not.toMatch(/total|cash|change|table|gerry/i);
  });

  it("repairs OCR look-alikes in prices", () => {
    const parsed = parseBillReceipt(lines("Pizza        6OO.OO", "Beer         l5O.00", "TOTAL        750.00"));
    expect(parsed.items).toEqual([
      { label: "Pizza", priceMinor: 60000 },
      { label: "Beer", priceMinor: 15000 },
    ]);
  });

  it("reads a quantity line (2 @ unit total) under the item name, taking the line total", () => {
    const parsed = parseBillReceipt(lines("Chicken Inasal", "2 @ 150.00     300.00", "TOTAL 300.00"));
    expect(parsed.items).toEqual([{ label: "Chicken Inasal ×2", priceMinor: 30000 }]);
  });

  it("handles thousands separators and a peso sign", () => {
    const parsed = parseBillReceipt(lines("Wagyu set      ₱1,250.50", "TOTAL       ₱1,250.50"));
    expect(parsed.items).toEqual([{ label: "Wagyu set", priceMinor: 125050 }]);
  });

  it("caps long labels at 60 characters", () => {
    const long = "A".repeat(80);
    expect(parseBillReceipt(`${long}   10.00`).items[0].label).toHaveLength(60);
  });

  it("returns nothing for text that is not a bill", () => {
    expect(parseBillReceipt("Hello there\nSee you tomorrow")).toEqual({ items: [], extras: [], totalMinor: null, skippedLines: 0, note: null });
    expect(parseBillReceipt("")).toEqual({ items: [], extras: [], totalMinor: null, skippedLines: 0, note: null });
  });

  it("keeps at most 60 items and counts the rest as skipped", () => {
    const many = Array.from({ length: 70 }, (_, i) => `Item ${i + 1}      10.00`).join("\n");
    const parsed = parseBillReceipt(many);
    expect(parsed.items).toHaveLength(60);
    expect(parsed.skippedLines).toBe(10);
  });

  it("counts a priced-looking line it cannot read instead of guessing", () => {
    const parsed = parseBillReceipt(lines("Pizza        600.00", "Soup         12,5O", "TOTAL        600.00"));
    expect(parsed.items).toEqual([{ label: "Pizza", priceMinor: 60000 }]);
    expect(parsed.skippedLines).toBe(1);
  });
});

describe("parseBillReceipt: extras and the total", () => {
  it("keeps a service charge that adds up to the total", () => {
    const parsed = parseBillReceipt(RESTAURANT);
    expect(parsed.extras).toEqual([{ kind: "SERVICE", valueMinor: 8155 }]);
    expect(parsed.note).toBeNull();
  });

  it("drops VAT that is already included in the prices, so tax is not charged twice", () => {
    const parsed = parseBillReceipt(GROCERY);
    expect(parsed.items.map((i) => i.priceMinor)).toEqual([9500, 5825, 11000]);
    expect(parsed.extras).toEqual([]);
    expect(parsed.totalMinor).toBe(26325);
    expect(parsed.note).toBe("VAT_INCLUDED");
  });

  it("keeps a service charge but drops included VAT when only that combination adds up", () => {
    const parsed = parseBillReceipt(lines("Steak   600.00", "Wine    400.00", "VAT 12%     107.14", "Service Charge   100.00", "TOTAL   1,100.00"));
    expect(parsed.extras).toEqual([{ kind: "SERVICE", valueMinor: 10000 }]);
    expect(parsed.note).toBe("VAT_INCLUDED");
  });

  it("reads a discount as a positive amount that takes money off", () => {
    const parsed = parseBillReceipt(lines("Pasta   500.00", "Salad   300.00", "Senior Citizen Discount   (160.00)", "TOTAL   640.00"));
    expect(parsed.extras).toEqual([{ kind: "DISCOUNT", valueMinor: 16000 }]);
    expect(parsed.note).toBeNull();
  });

  it("reads tip and delivery lines", () => {
    const parsed = parseBillReceipt(lines("Burger  250.00", "Delivery Fee  49.00", "Tip  20.00", "TOTAL  319.00"));
    expect(parsed.extras).toEqual([
      { kind: "DELIVERY", valueMinor: 4900 },
      { kind: "TIP", valueMinor: 2000 },
    ]);
  });

  it("adds up several lines of the same kind", () => {
    const parsed = parseBillReceipt(lines("Burger  1,000.00", "Promo  50.00", "Voucher  50.00", "TOTAL  900.00"));
    expect(parsed.extras).toEqual([{ kind: "DISCOUNT", valueMinor: 10000 }]);
  });

  it("returns the total but no extras when nothing adds up, and says so", () => {
    const parsed = parseBillReceipt(lines("Pizza  100.00", "Beer  200.00", "Service Charge  10.00", "TOTAL  400.00"));
    expect(parsed.items).toHaveLength(2);
    expect(parsed.extras).toEqual([]);
    expect(parsed.totalMinor).toBe(40000);
    expect(parsed.note).toBe("MISMATCH");
  });

  it("without a printed total, keeps real extras but not tax (which is usually included)", () => {
    const parsed = parseBillReceipt(lines("Pizza  500.00", "Service Charge  50.00", "VAT 12%  60.00"));
    expect(parsed.totalMinor).toBeNull();
    expect(parsed.extras).toEqual([{ kind: "SERVICE", valueMinor: 5000 }]);
    expect(parsed.note).toBe("NO_TOTAL");
  });
});
