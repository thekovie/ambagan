import type { ExtraKind } from "@/lib/split";
import { MONEY, readMoney } from "./parse";

/**
 * Reads the text of a restaurant or shop receipt into bill items, extras and the printed total, for the "By items"
 * builder to pre-fill. Pure and client-safe. It only ever suggests: the admin checks every line, and anything that
 * does not add up to the printed total is left out and flagged rather than guessed.
 */

export interface ScannedItem {
  label: string;
  priceMinor: number;
}

export interface ScannedExtra {
  kind: ExtraKind;
  /** Always positive; a discount takes money off. */
  valueMinor: number;
}

export type BillScanNote =
  /** The receipt's VAT is already inside the item prices, so it was not added again. */
  | "VAT_INCLUDED"
  /** The items and extras did not add up to the printed total, so no extras were added. */
  | "MISMATCH"
  /** No total was found on the receipt, so nothing could be checked. */
  | "NO_TOTAL";

export interface BillScan {
  items: ScannedItem[];
  extras: ScannedExtra[];
  totalMinor: number | null;
  /** Lines that looked like they had a price but could not be read. Never shown as text: raw text is not kept. */
  skippedLines: number;
  note: BillScanNote | null;
}

const MAX_TEXT = 20_000;
const MAX_ITEMS = 60;
const MAX_LABEL = 60;

const SUBTOTAL = /sub\s*-?\s*total/i;
const DISCOUNT = /discount|promo|senior|\bpwd\b|voucher|coupon|\bless\b/i;
const SERVICE = /service\s*(charge|chg|fee)|\bsvc\b|\bs\.?c\.?\b/i;
const DELIVERY = /\b(delivery|shipping|rider)\b/i;
const TIP = /\b(tip|gratuity)\b/i;
const TAX = /\b(vat|tax)\b/i;
const TOTAL = /\b(grand\s+)?total\b|amount\s+due|balance\s+due/i;
// Payment and VAT-breakdown lines: not part of what was bought.
const IGNORED = /\bcash\b|\bchange\b|tender|\bvisa\b|master\s?card|\bdebit\b|\bcredit\b|\bcard\b|g\s?cash|\bmaya\b|vatable|vat[\s-]*exempt|zero[\s-]*rated|net\s+of\s+vat|vat\s+sales|\bpaid\b/i;
const HAS_WORD = /[A-Za-z]{2}/;
// A number with a decimal part at the end of the line that could not be read as pesos (e.g. "12,5O").
const UNREADABLE_PRICE = /\d[.,]\d*[OolI\d]*\s*$/;

interface Price {
  minor: number;
  index: number;
  length: number;
}

// OCR often reads a leading 1 as l or I ("l5O.00"): fix that before looking for prices.
const LEADING_ONE = /(?<=^|\s)[lI](?=[\dOo]{1,3}[.,]\d{2}(?:\s|$))/g;

function pricesOn(line: string): Price[] {
  const found: Price[] = [];
  for (const match of line.matchAll(MONEY)) {
    const money = readMoney(match[2], match[1]);
    if (money?.hasMarkerOrDecimals) found.push({ minor: money.minor, index: match.index ?? 0, length: match[0].length });
  }
  return found;
}

/** The name before the last price, tidied, and a leading quantity ("2 x", "2 @", "2 ") split off. */
function nameAndQuantity(line: string, lastPriceAt: number): { text: string; quantity: number } {
  // Only real prices are removed: a bare "2" at the start is a quantity, not money.
  let text = line.slice(0, lastPriceAt);
  for (const price of pricesOn(text).reverse()) text = `${text.slice(0, price.index)} ${text.slice(price.index + price.length)}`;
  text = text.replace(/\s+/g, " ").trim();
  let quantity = 1;
  const lead = /^(\d{1,3})(?:\s*[x×@]\s*|\s+)/i.exec(text);
  if (lead) {
    quantity = Number(lead[1]);
    text = text.slice(lead[0].length);
  }
  return { text: text.replace(/[\s@x×:.\-–—]+$/i, "").trim(), quantity };
}

function extraKindOf(line: string): ExtraKind | null {
  if (DISCOUNT.test(line)) return "DISCOUNT";
  if (SERVICE.test(line)) return "SERVICE";
  if (DELIVERY.test(line)) return "DELIVERY";
  if (TIP.test(line)) return "TIP";
  if (TAX.test(line)) return "TAX";
  return null;
}

export function parseBillReceipt(rawText: string): BillScan {
  const items: ScannedItem[] = [];
  const totals = new Map<ExtraKind, number>();
  let totalMinor: number | null = null;
  let skipped = 0;
  // The name sits on the line above when a quantity line (2 @ 150.00  300.00) has none of its own.
  let pendingName = "";

  for (const raw of rawText.slice(0, MAX_TEXT).split(/\r?\n/)) {
    const line = raw.trim().replace(LEADING_ONE, "1");
    if (!line) continue;
    const last = pricesOn(line).at(-1);
    const kind = extraKindOf(line);
    const isKeyword = SUBTOTAL.test(line) || IGNORED.test(line) || TOTAL.test(line) || kind !== null;

    if (!last) {
      if (!isKeyword && HAS_WORD.test(line)) {
        if (UNREADABLE_PRICE.test(line)) skipped += 1;
        else pendingName = line;
      }
      continue;
    }
    if (SUBTOTAL.test(line) || IGNORED.test(line)) continue;
    if (kind) {
      totals.set(kind, (totals.get(kind) ?? 0) + last.minor);
      continue;
    }
    if (TOTAL.test(line)) {
      totalMinor = last.minor;
      continue;
    }

    const { text, quantity } = nameAndQuantity(line, last.index);
    const name = HAS_WORD.test(text) ? text : pendingName;
    pendingName = "";
    if (!HAS_WORD.test(name)) {
      skipped += 1;
      continue;
    }
    items.push({ label: (quantity > 1 ? `${name} ×${quantity}` : name).slice(0, MAX_LABEL), priceMinor: last.minor });
  }

  skipped += Math.max(0, items.length - MAX_ITEMS);
  return { ...reconcile(items.slice(0, MAX_ITEMS), totals, totalMinor), skippedLines: skipped };
}

/**
 * Philippine receipts usually print VAT as already inside the prices, so adding it again would overcharge everyone.
 * Keep the extras only if the numbers prove they belong: items alone equal the total (all included), items plus all
 * extras equal it, or items plus everything except tax equal it. Otherwise return no extras and say why.
 */
function reconcile(items: ScannedItem[], totals: Map<ExtraKind, number>, totalMinor: number | null): Pick<BillScan, "items" | "extras" | "totalMinor" | "note"> {
  const extras: ScannedExtra[] = [...totals].map(([kind, valueMinor]) => ({ kind, valueMinor }));
  if (items.length === 0) return { items, extras: [], totalMinor, note: null };

  const withoutTax = extras.filter((e) => e.kind !== "TAX");
  if (totalMinor === null) return { items, extras: withoutTax, totalMinor, note: "NO_TOTAL" };

  const sum = items.reduce((acc, i) => acc + i.priceMinor, 0);
  const net = (list: ScannedExtra[]) => list.reduce((acc, e) => acc + (e.kind === "DISCOUNT" ? -e.valueMinor : e.valueMinor), 0);

  if (sum === totalMinor) return { items, extras: [], totalMinor, note: extras.length > 0 ? "VAT_INCLUDED" : null };
  if (sum + net(extras) === totalMinor) return { items, extras, totalMinor, note: null };
  if (withoutTax.length < extras.length && sum + net(withoutTax) === totalMinor) return { items, extras: withoutTax, totalMinor, note: "VAT_INCLUDED" };
  return { items, extras: [], totalMinor, note: "MISMATCH" };
}
