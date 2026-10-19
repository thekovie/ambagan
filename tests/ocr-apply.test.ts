import { describe, expect, it } from "vitest";
import { applyReceipt, type PaymentFields } from "@/lib/ocr/apply";
import { parseReceipt } from "@/lib/ocr/parse";
import { GCASH, GCASH_NO_REFERENCE, GCASH_NOISY, UNRELATED_TEXT } from "./fixtures/receipts";

const APPS = ["GCash", "Maya", "MariBank", "Other"];
const blank: PaymentFields = {
  destination: "gcash-id",
  app: "Maya",
  appOther: "",
  amount: "75.50",
  reference: "",
  date: "2026-10-19T18:00",
  notes: "typed by hand",
};

describe("applyReceipt", () => {
  it("fills amount, reference, date and sending app from a clean receipt, and leaves everything else alone", () => {
    const { fields, detected } = applyReceipt({ ...blank, amount: "" }, parseReceipt(GCASH), APPS);
    expect(fields).toMatchObject({
      amount: "75.50",
      reference: "7034512840193",
      date: "2026-10-10T16:25", // Manila local time
      app: "GCash",
      destination: "gcash-id",
      notes: "typed by hand",
    });
    expect(detected.sort()).toEqual(["amount", "app", "date", "reference"]);
  });

  it("still fills repaired (medium-confidence) values, which the form flags for checking", () => {
    const { fields, detected } = applyReceipt(blank, parseReceipt(GCASH_NOISY), APPS);
    expect(fields.reference).toBe("7034512840193");
    expect(detected).toContain("reference");
  });

  it("leaves a field untouched when it could not be read", () => {
    const { fields, detected } = applyReceipt({ ...blank, reference: "typed ref" }, parseReceipt(GCASH_NO_REFERENCE), APPS);
    expect(fields.reference).toBe("typed ref");
    expect(detected).not.toContain("reference");
    expect(detected).toContain("amount");
  });

  it("never fills from a receipt it doesn't recognise (values are low confidence)", () => {
    const { fields, detected } = applyReceipt(blank, parseReceipt(UNRELATED_TEXT), APPS);
    expect(fields).toEqual(blank);
    expect(detected).toEqual([]);
  });

  it("does not switch the paying app to one that isn't in the list", () => {
    const { fields, detected } = applyReceipt(blank, parseReceipt(GCASH), ["Maya", "Other"]);
    expect(fields.app).toBe("Maya");
    expect(detected).not.toContain("app");
  });
});
