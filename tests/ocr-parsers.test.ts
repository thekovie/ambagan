import { describe, expect, it } from "vitest";
import { validateReceiptFile } from "@/lib/ocr/file";
import { parseReceipt, parseReceiptDate } from "@/lib/ocr/parse";
import {
  AMBIGUOUS_AMOUNTS,
  GCASH,
  GCASH_NO_REFERENCE,
  GCASH_NOISY,
  MARIBANK,
  MAYA,
  MAYA_WITH_FEE,
  THOUSANDS,
  UNRELATED_TEXT,
} from "./fixtures/receipts";

describe("GCash", () => {
  it("reads amount, reference, date and recipient; the sending app is the app that produced the receipt", () => {
    const r = parseReceipt(GCASH);
    expect(r.provider).toBe("GCASH");
    expect(r.sendingApp).toBe("GCash");
    expect(r.amountMinor).toEqual({ value: 7550, confidence: "high" });
    expect(r.reference).toEqual({ value: "7034512840193", confidence: "high" });
    expect(r.transactionDate.value?.toISOString()).toBe("2026-10-10T08:25:00.000Z"); // 4:25 PM Manila
    expect(r.transactionDate.confidence).toBe("high");
    expect(r.recipient).toContain("KO*** D.");
    expect(r.needsReview).toBe(false);
  });

  it("copes with OCR confusing O and 0, ignores the account balance, and says it repaired something", () => {
    const r = parseReceipt(GCASH_NOISY);
    expect(r.provider).toBe("GCASH");
    expect(r.amountMinor.value).toBe(7550); // the labelled total, not the balance
    expect(r.reference).toEqual({ value: "7034512840193", confidence: "medium" });
    expect(r.transactionDate.value?.toISOString()).toBe("2026-10-10T08:25:00.000Z");
    expect(r.transactionDate.confidence).toBe("medium");
  });

  it("reads thousands separators", () => {
    expect(parseReceipt(THOUSANDS).amountMinor.value).toBe(125000);
  });

  it("flags a missing reference for review instead of inventing one", () => {
    const r = parseReceipt(GCASH_NO_REFERENCE);
    expect(r.reference).toEqual({ value: null, confidence: "none" });
    expect(r.amountMinor.value).toBe(7550);
    expect(r.needsReview).toBe(true);
  });
});

describe("Maya", () => {
  it("reads an amount that sits on the line after its label", () => {
    const r = parseReceipt(MAYA);
    expect(r.provider).toBe("MAYA");
    expect(r.sendingApp).toBe("Maya");
    expect(r.amountMinor).toEqual({ value: 7550, confidence: "high" });
    expect(r.reference.value).toBe("4f9a1c2e8b7d");
    expect(r.transactionDate.value?.toISOString()).toBe("2026-10-10T08:25:00.000Z");
    expect(r.recipient).toBe("Kovie D.");
  });

  it("prefers the labelled total over the base amount and the fee", () => {
    expect(parseReceipt(MAYA_WITH_FEE).amountMinor).toEqual({ value: 7550, confidence: "high" });
  });

  it("refuses to guess between several unlabelled amounts", () => {
    const r = parseReceipt(AMBIGUOUS_AMOUNTS);
    expect(r.amountMinor).toEqual({ value: null, confidence: "none" });
    expect(r.warnings.join(" ")).toMatch(/several amounts/i);
    expect(r.needsReview).toBe(true);
  });
});

describe("MariBank", () => {
  it("reads a 24-hour timestamp with seconds and a prefixed reference", () => {
    const r = parseReceipt(MARIBANK);
    expect(r.provider).toBe("MARIBANK");
    expect(r.sendingApp).toBe("MariBank");
    expect(r.amountMinor).toEqual({ value: 7550, confidence: "high" });
    expect(r.reference).toEqual({ value: "MB2610104125987", confidence: "high" });
    expect(r.transactionDate.value?.toISOString()).toBe("2026-10-10T08:25:08.000Z");
    expect(r.recipient).toBe("KOVIE D.");
  });
});

describe("unrecognised or empty input", () => {
  it("never trusts numbers from a receipt it doesn't recognise", () => {
    const r = parseReceipt(UNRELATED_TEXT);
    expect(r.provider).toBe("UNKNOWN");
    expect(r.sendingApp).toBeNull();
    expect(["low", "none"]).toContain(r.amountMinor.confidence);
    expect(r.warnings.join(" ")).toMatch(/recogni[sz]e/i);
    expect(r.needsReview).toBe(true);
  });

  it("returns an empty, review-required result for blank text", () => {
    for (const blank of ["", "   \n  "]) {
      const r = parseReceipt(blank);
      expect(r.provider).toBe("UNKNOWN");
      expect(r.amountMinor.value).toBeNull();
      expect(r.reference.value).toBeNull();
      expect(r.transactionDate.value).toBeNull();
      expect(r.needsReview).toBe(true);
    }
  });

  it("never throws on hostile input", () => {
    expect(() => parseReceipt("\u0000".repeat(5000) + "₱".repeat(5000) + "9".repeat(100_000))).not.toThrow();
  });
});

describe("parseReceiptDate (Manila time)", () => {
  it.each([
    ["Oct 10, 2026 4:25 PM", "2026-10-10T08:25:00.000Z"],
    ["Oct 10, 2026, 04:25 PM", "2026-10-10T08:25:00.000Z"],
    ["October 10, 2026 12:05 AM", "2026-10-09T16:05:00.000Z"],
    ["10 Oct 2026 16:25:08", "2026-10-10T08:25:08.000Z"],
    ["2026-10-10 16:25", "2026-10-10T08:25:00.000Z"],
    ["10/10/2026 16:25", "2026-10-10T08:25:00.000Z"],
    ["Oct 10, 2026 12:00 PM", "2026-10-10T04:00:00.000Z"],
  ])("reads %s", (text, iso) => {
    expect(parseReceiptDate(text)?.date.toISOString()).toBe(iso);
  });

  it("rejects impossible dates and text with no date", () => {
    expect(parseReceiptDate("Oct 32, 2026 4:25 PM")).toBeNull();
    expect(parseReceiptDate("Feb 30, 2026 4:25 PM")).toBeNull();
    expect(parseReceiptDate("no date here")).toBeNull();
  });
});

describe("validateReceiptFile", () => {
  const mb = 1024 * 1024;

  it("accepts ordinary screenshot formats", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(validateReceiptFile({ type, size: 2 * mb })).toEqual({ ok: true });
    }
  });

  it("rejects non-images, unsupported images, empty and oversized files", () => {
    expect(validateReceiptFile({ type: "application/pdf", size: mb })).toEqual({ ok: false, error: "NOT_AN_IMAGE" });
    expect(validateReceiptFile({ type: "image/heic", size: mb })).toEqual({ ok: false, error: "NOT_AN_IMAGE" });
    expect(validateReceiptFile({ type: "image/png", size: 0 })).toEqual({ ok: false, error: "EMPTY" });
    expect(validateReceiptFile({ type: "image/png", size: 11 * mb })).toEqual({ ok: false, error: "TOO_LARGE" });
  });
});
