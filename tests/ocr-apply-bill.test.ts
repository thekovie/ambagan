import { describe, expect, it } from "vitest";
import { applyBillScan, pesosText, scanSummary } from "@/lib/ocr/apply-bill";
import type { BillScan } from "@/lib/ocr/parse-bill";
import { buildItemsSplitInput, type DraftExtra, type DraftItem, type DraftPerson } from "@/lib/split";

let counter = 0;
const newId = () => `id-${++counter}`;

const scan = (over: Partial<BillScan> = {}): BillScan => ({
  items: [
    { label: "Sisig", priceMinor: 35000 },
    { label: "Rice ×2", priceMinor: 12050 },
  ],
  extras: [{ kind: "SERVICE", valueMinor: 4705 }],
  totalMinor: 51755,
  skippedLines: 0,
  note: null,
  ...over,
});

const blank: DraftItem = { id: "first-item", label: "", priceText: "", assignees: [] };

describe("pesosText", () => {
  it("writes centavos as plain pesos the form can read back", () => {
    expect(pesosText(35000)).toBe("350.00");
    expect(pesosText(125050)).toBe("1250.50");
    expect(pesosText(5)).toBe("0.05");
  });
});

describe("applyBillScan", () => {
  it("fills a blank form with the scanned items, nobody chosen yet", () => {
    const next = applyBillScan({ items: [blank], extras: [] }, scan(), newId);
    expect(next.items.map((i) => [i.label, i.priceText, i.assignees])).toEqual([
      ["Sisig", "350.00", []],
      ["Rice ×2", "120.50", []],
    ]);
    expect(new Set(next.items.map((i) => i.id)).size).toBe(2);
    expect(next.receiptText).toBe("517.55");
  });

  it("adds to what the admin already typed instead of replacing it", () => {
    const typed: DraftItem = { id: "mine", label: "Beer", priceText: "100", assignees: ["a"] };
    const next = applyBillScan({ items: [typed], extras: [] }, scan(), newId);
    expect(next.items.map((i) => i.label)).toEqual(["Beer", "Sisig", "Rice ×2"]);
    expect(next.items[0]).toBe(typed);
  });

  it("turns extras into peso amounts, sharing delivery equally and everything else in proportion", () => {
    const next = applyBillScan({ items: [blank], extras: [] }, scan({ extras: [{ kind: "SERVICE", valueMinor: 4705 }, { kind: "DELIVERY", valueMinor: 4900 }, { kind: "DISCOUNT", valueMinor: 1000 }] }), newId);
    expect(next.extras.map((e) => [e.kind, e.mode, e.valueText, e.allocate])).toEqual([
      ["SERVICE", "AMOUNT", "47.05", "PROPORTIONAL"],
      ["DELIVERY", "AMOUNT", "49.00", "EQUAL"],
      ["DISCOUNT", "AMOUNT", "10.00", "PROPORTIONAL"],
    ]);
  });

  it("replaces an extra of the same kind but keeps the others", () => {
    const existing: DraftExtra[] = [
      { id: "e1", kind: "SERVICE", label: "", mode: "PERCENT", valueText: "10", allocate: "PROPORTIONAL" },
      { id: "e2", kind: "TIP", label: "", mode: "AMOUNT", valueText: "20", allocate: "PROPORTIONAL" },
    ];
    const next = applyBillScan({ items: [blank], extras: existing }, scan(), newId);
    expect(next.extras.map((e) => [e.kind, e.valueText])).toEqual([["TIP", "20"], ["SERVICE", "47.05"]]);
  });

  it("leaves the receipt total alone when none was read", () => {
    expect(applyBillScan({ items: [blank], extras: [] }, scan({ totalMinor: null }), newId).receiptText).toBeNull();
  });

  it("never goes past the 60 item limit", () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ label: `Item ${i}`, priceMinor: 100 }));
    expect(applyBillScan({ items: [blank], extras: [] }, scan({ items: many }), newId).items).toHaveLength(60);
  });

  it("produces something the split engine accepts once people are chosen", () => {
    const next = applyBillScan({ items: [blank], extras: [] }, scan(), newId);
    const people: DraftPerson[] = [{ id: "a", name: "A", shares: "1", percent: "", amount: "" }];
    const items = next.items.map((i) => ({ ...i, assignees: ["a"] }));
    const draft = buildItemsSplitInput({ people, items, extras: next.extras, receiptText: next.receiptText ?? "" });
    expect("input" in draft).toBe(true);
  });
});

describe("scanSummary", () => {
  it("says what was read and to check it", () => {
    const { headline, notes } = scanSummary(scan());
    expect(headline).toBe("Read 2 items and a total of ₱517.55. Check each against your receipt, then choose who shared each one.");
    expect(notes).toEqual([]);
  });

  it("uses the singular for one item and handles a missing total", () => {
    const { headline, notes } = scanSummary(scan({ items: [{ label: "Sisig", priceMinor: 35000 }], extras: [], totalMinor: null, note: "NO_TOTAL" }));
    expect(headline).toBe("Read 1 item. Check each against your receipt, then choose who shared each one.");
    expect(notes).toEqual(["We couldn't find the total on the receipt, so we couldn't check these against it."]);
  });

  it("explains included VAT, a mismatch and unreadable lines in plain words", () => {
    expect(scanSummary(scan({ note: "VAT_INCLUDED" })).notes).toEqual(["The receipt's VAT is already in the prices, so we didn't add it again."]);
    expect(scanSummary(scan({ note: "MISMATCH", extras: [], totalMinor: 60000 })).notes).toEqual([
      "The items add up to ₱470.50 but the receipt says ₱600.00, so we didn't add tax or service. Check for a missing line.",
    ]);
    expect(scanSummary(scan({ skippedLines: 1 })).notes).toEqual(["1 line couldn't be read."]);
    expect(scanSummary(scan({ skippedLines: 3 })).notes).toEqual(["3 lines couldn't be read."]);
  });

  it("says plainly when nothing was read", () => {
    expect(scanSummary(scan({ items: [], extras: [], totalMinor: null })).headline).toBe("We couldn't read any items from that image. Try a flat, well-lit photo, or add them by hand below.");
  });
});
