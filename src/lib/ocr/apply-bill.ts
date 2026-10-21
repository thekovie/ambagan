import { formatMinor } from "@/lib/money";
import type { DraftExtra, DraftItem } from "@/lib/split";
import type { BillScan } from "./parse-bill";

const MAX_ITEMS = 60;
const MAX_EXTRAS = 10;

/** Centavos as plain pesos ("1250.50"), the way someone would type them into the form. */
export function pesosText(minor: number): string {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

const isBlank = (item: DraftItem) => !item.label.trim() && !item.priceText.trim() && item.assignees.length === 0;

export interface BillFormState {
  items: DraftItem[];
  extras: DraftExtra[];
}

/**
 * Puts a scan into the builder's fields. Scanned items start with nobody chosen (the admin taps who shared each one),
 * so a wrong guess can never bill the wrong person. A form with nothing typed is replaced; otherwise the scan is
 * added after what is there. An extra of a kind the receipt had replaces the old one of that kind. `receiptText` is
 * null when no total was read, meaning "leave the field as it is".
 */
export function applyBillScan(current: BillFormState, scan: BillScan, newId: () => string = () => crypto.randomUUID()): BillFormState & { receiptText: string | null } {
  const scanned: DraftItem[] = scan.items.map((item) => ({ id: newId(), label: item.label, priceText: pesosText(item.priceMinor), assignees: [] }));
  const kept = current.items.filter((item) => !isBlank(item));

  const scannedKinds = new Set(scan.extras.map((e) => e.kind));
  const extras: DraftExtra[] = scan.extras.map((e) => ({
    id: newId(),
    kind: e.kind,
    label: "",
    mode: "AMOUNT",
    valueText: pesosText(e.valueMinor),
    allocate: e.kind === "DELIVERY" ? "EQUAL" : "PROPORTIONAL",
  }));

  return {
    items: [...kept, ...scanned].slice(0, MAX_ITEMS),
    extras: [...current.extras.filter((e) => !scannedKinds.has(e.kind)), ...extras].slice(0, MAX_EXTRAS),
    receiptText: scan.totalMinor === null ? null : pesosText(scan.totalMinor),
  };
}

const peso = (minor: number) => formatMinor(minor, "PHP");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What to tell the admin after a scan: what was read, and what to double-check. */
export function scanSummary(scan: BillScan): { headline: string; notes: string[] } {
  if (scan.items.length === 0) {
    return { headline: "We couldn't read any items from that image. Try a flat, well-lit photo, or add them by hand below.", notes: [] };
  }
  const total = scan.totalMinor === null ? "" : ` and a total of ${peso(scan.totalMinor)}`;
  const notes: string[] = [];
  if (scan.note === "VAT_INCLUDED") notes.push("The receipt's VAT is already in the prices, so we didn't add it again.");
  if (scan.note === "MISMATCH" && scan.totalMinor !== null) {
    const sum = scan.items.reduce((acc, i) => acc + i.priceMinor, 0);
    notes.push(`The items add up to ${peso(sum)} but the receipt says ${peso(scan.totalMinor)}, so we didn't add tax or service. Check for a missing line.`);
  }
  if (scan.note === "NO_TOTAL") notes.push("We couldn't find the total on the receipt, so we couldn't check these against it.");
  if (scan.skippedLines > 0) notes.push(`${plural(scan.skippedLines, "line", "lines")} couldn't be read.`);
  return { headline: `Read ${plural(scan.items.length, "item", "items")}${total}. Check each against your receipt, then choose who shared each one.`, notes };
}
