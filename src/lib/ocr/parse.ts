/**
 * Turns raw OCR text from a Philippine e-wallet/bank receipt into candidate payment fields.
 *
 * Principles:
 * - Fail safe. A field is either found with a stated confidence or left empty; nothing is guessed.
 *   Several competing amounts yield no amount, a missing reference stays missing.
 * - Receipts from an unrecognised app never get "high" or "medium" confidence: numbers on a grocery
 *   receipt are not a payment.
 * - OCR confusions (O for 0, l/I for 1) are repaired only inside numeric tokens, and a repair lowers
 *   confidence to "medium" so the member is nudged to check.
 * - The output only pre-fills a form the member reviews; it never approves or submits anything.
 */

import { parsePesosToMinor } from "@/lib/money";

export type Confidence = "high" | "medium" | "low" | "none";

export interface Field<T> {
  value: T | null;
  confidence: Confidence;
}

export type Provider = "GCASH" | "MAYA" | "MARIBANK" | "UNKNOWN";

export interface ParsedReceipt {
  provider: Provider;
  /** The app that produced the receipt is the app the money was sent from. */
  sendingApp: string | null;
  amountMinor: Field<number>;
  reference: Field<string>;
  transactionDate: Field<Date>;
  /** Free text as printed (often masked), for the member to eyeball. */
  recipient: string | null;
  warnings: string[];
  /** True when the member must look closely: a key field is missing or low confidence. */
  needsReview: boolean;
}

const MAX_TEXT = 20_000;
const none = <T>(): Field<T> => ({ value: null, confidence: "none" });

const PROVIDERS: { provider: Exclude<Provider, "UNKNOWN">; name: string; pattern: RegExp }[] = [
  { provider: "GCASH", name: "GCash", pattern: /g\s?cash/i },
  { provider: "MARIBANK", name: "MariBank", pattern: /mari\s?bank/i },
  { provider: "MAYA", name: "Maya", pattern: /pay\s?maya|maya/i },
];

/** The earliest-mentioned app wins: the header comes first, "from GCash" lines come later. */
function detectProvider(text: string): { provider: Provider; name: string | null } {
  let best: { provider: Provider; name: string | null; at: number } = { provider: "UNKNOWN", name: null, at: Infinity };
  for (const p of PROVIDERS) {
    const at = text.search(p.pattern);
    if (at !== -1 && at < best.at) best = { provider: p.provider, name: p.name, at };
  }
  return { provider: best.provider, name: best.name };
}

// ---- numeric repair -------------------------------------------------------------------------

/** Repairs letter look-alikes in a token that is meant to be digits. Returns whether it changed. */
function repairDigits(token: string): { text: string; repaired: boolean } {
  const text = token.replace(/[Oo]/g, "0").replace(/[lI]/g, "1");
  return { text, repaired: text !== token };
}

// ---- amount ---------------------------------------------------------------------------------

// A money token: optional currency marker, then digits (with OCR look-alikes) and optional decimals.
const MONEY = /(₱|PHP|Php|php|P)?\s?(\d[\dOolI,]*(?:\.[\dOolI]{1,2})?)/g;

interface Money {
  minor: number;
  repaired: boolean;
  hasMarkerOrDecimals: boolean;
}

function readMoney(token: string, marker: string | undefined): Money | null {
  const { text, repaired } = repairDigits(token);
  const minor = parsePesosToMinor(text);
  if (minor === null) return null;
  return { minor, repaired, hasMarkerOrDecimals: Boolean(marker) || text.includes(".") };
}

/** All money-looking values in a piece of text (currency marker or a decimal part required). */
function moneyIn(text: string): Money[] {
  const found: Money[] = [];
  for (const match of text.matchAll(MONEY)) {
    const money = readMoney(match[2], match[1]);
    if (money?.hasMarkerOrDecimals) found.push(money);
  }
  return found;
}

// Most specific first: the first label that yields a value wins.
const AMOUNT_LABELS = ["total amount sent", "total amount", "amount sent", "you sent", "amount paid", "total", "amount"];

function labelledAmount(lines: string[]): Money | null {
  for (const label of AMOUNT_LABELS) {
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      const at = lower.indexOf(label);
      if (at === -1 || /balance/.test(lower)) continue;
      const sameLine = moneyIn(lines[i].slice(at + label.length))[0];
      if (sameLine) return sameLine;
      // Many receipts print the value on the line after its label.
      const next = lines[i + 1];
      if (next && /^(?:₱|PHP|Php|php|P)?\s?\d[\dOolI,]*(?:\.[\dOolI]{1,2})?$/.test(next)) {
        const value = moneyIn(next)[0];
        if (value) return value;
      }
    }
  }
  return null;
}

function unlabelledAmounts(lines: string[]): Money[] {
  const amounts: Money[] = [];
  for (const line of lines) {
    if (/balance|fee|charge|ref/i.test(line)) continue;
    amounts.push(...moneyIn(line));
  }
  return amounts;
}

// ---- reference ------------------------------------------------------------------------------

const REFERENCE_LABEL =
  /^(?:ref(?:erence)?\.?\s*(?:no\.?|number|id|#)?|transaction\s*(?:id|no\.?|number)|trace\s*(?:no\.?|number))\s*[:#]?\s*(.*)$/i;
const DIGIT_GROUPS = /^[\dOolI]{3,}(?:\s[\dOolI]{2,})*$/;

function readReference(value: string): Field<string> {
  const text = value.trim();
  if (DIGIT_GROUPS.test(text) && /\d/.test(text)) {
    // e.g. GCash "7034 512 840193": digits in groups.
    const { text: digits, repaired } = repairDigits(text.replace(/\s/g, ""));
    if (digits.length >= 8) return { value: digits, confidence: repaired ? "medium" : "high" };
  }
  const token = /[A-Za-z0-9]{8,24}/.exec(text)?.[0];
  return token ? { value: token, confidence: "high" } : none();
}

function findReference(lines: string[]): Field<string> {
  for (let i = 0; i < lines.length; i++) {
    const match = REFERENCE_LABEL.exec(lines[i]);
    if (!match) continue;
    const candidates = [match[1], lines[i + 1] ?? ""].filter(Boolean);
    for (const candidate of candidates) {
      const field = readReference(candidate);
      if (field.value) return field;
    }
  }
  return none();
}

// ---- date -----------------------------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAME = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
const TIME = "(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*(am|pm)?";

const MONTH_FIRST = new RegExp(`\\b${MONTH_NAME}\\s+(\\d{1,2}),?\\s+(\\d{4}),?\\s+${TIME}`, "i");
const DAY_FIRST = new RegExp(`\\b(\\d{1,2})\\s+${MONTH_NAME},?\\s+(\\d{4}),?\\s+${TIME}`, "i");
const ISO = new RegExp(`\\b(\\d{4})-(\\d{2})-(\\d{2})[ T]${TIME}`, "i");
const NUMERIC = new RegExp(`\\b(\\d{1,2})/(\\d{1,2})/(\\d{4}),?\\s+${TIME}`, "i");

/** Manila is UTC+8 with no daylight saving. Rejects impossible calendar dates and times. */
function toManila(y: number, mo: number, d: number, h: number, mi: number, s: number, meridiem?: string): Date | null {
  let hour = h;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const pm = meridiem.toLowerCase() === "pm";
    hour = (hour % 12) + (pm ? 12 : 0);
  }
  if (hour > 23 || mi > 59 || s > 59 || mo < 1 || mo > 12 || d < 1) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return new Date(Date.UTC(y, mo - 1, d, hour - 8, mi, s));
}

/** Repairs O/l look-alikes only where they touch a digit ("1O" -> "10"), and reports whether it did. */
function repairDateText(text: string): { text: string; repaired: boolean } {
  const fixed = text.replace(/(?<=\d)[Oo]|[Oo](?=\d)/g, "0").replace(/(?<=\d)[lI]|[lI](?=\d)/g, "1");
  return { text: fixed, repaired: fixed !== text };
}

export function parseReceiptDate(raw: string): { date: Date; repaired: boolean } | null {
  const { text, repaired } = repairDateText(raw.slice(0, MAX_TEXT));
  const month = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
  const num = (value: string | undefined) => (value === undefined ? 0 : Number(value));

  let date: Date | null = null;
  let m: RegExpExecArray | null;
  if ((m = MONTH_FIRST.exec(text))) date = toManila(num(m[3]), month(m[1]), num(m[2]), num(m[4]), num(m[5]), num(m[6]), m[7]);
  else if ((m = DAY_FIRST.exec(text))) date = toManila(num(m[3]), month(m[2]), num(m[1]), num(m[4]), num(m[5]), num(m[6]), m[7]);
  else if ((m = ISO.exec(text))) date = toManila(num(m[1]), num(m[2]), num(m[3]), num(m[4]), num(m[5]), num(m[6]), m[7]);
  else if ((m = NUMERIC.exec(text))) {
    const a = num(m[1]);
    const b = num(m[2]);
    // 10/11 could be either order: only read it when it can't be misread.
    if (a === b || a > 12) date = toManila(num(m[3]), b, a, num(m[4]), num(m[5]), num(m[6]), m[7]);
    else if (b > 12) date = toManila(num(m[3]), a, b, num(m[4]), num(m[5]), num(m[6]), m[7]);
  }
  return date ? { date, repaired } : null;
}

// ---- recipient ------------------------------------------------------------------------------

const RECIPIENT_LABEL = /^(?:sent\s+to|recipient(?:\s+name)?|beneficiary|to)\s*:?\s*(.*)$/i;

function findRecipient(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const match = RECIPIENT_LABEL.exec(lines[i]);
    // "to" must be its own word: "Total" is not a recipient label.
    if (!match || (/^to/i.test(lines[i]) && !/^to\s/i.test(lines[i]) && !/^to:/i.test(lines[i]))) continue;
    const value = (match[1] || lines[i + 1] || "").trim();
    if (value) return value.slice(0, 80);
  }
  return null;
}

// ---- assemble -------------------------------------------------------------------------------

const capLow = <T>(field: Field<T>): Field<T> =>
  field.confidence === "high" || field.confidence === "medium" ? { ...field, confidence: "low" } : field;

export function parseReceipt(rawText: string): ParsedReceipt {
  const text = rawText.slice(0, MAX_TEXT);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const { provider, name } = detectProvider(text);
  const warnings: string[] = [];

  // Amount: a labelled total beats everything; otherwise only a single unambiguous value is used.
  let amount: Field<number> = none();
  const labelled = labelledAmount(lines);
  if (labelled) {
    amount = { value: labelled.minor, confidence: labelled.repaired ? "medium" : "high" };
  } else {
    const distinct = [...new Set(unlabelledAmounts(lines).map((m) => m.minor))];
    if (distinct.length === 1) amount = { value: distinct[0], confidence: "medium" };
    else if (distinct.length > 1) warnings.push("Several amounts were found and none was clearly the total. Please enter it.");
  }

  let reference = findReference(lines);
  const parsedDate = parseReceiptDate(text);
  let transactionDate: Field<Date> = parsedDate
    ? { value: parsedDate.date, confidence: parsedDate.repaired ? "medium" : "high" }
    : none();

  if (provider === "UNKNOWN") {
    warnings.unshift("We couldn't recognise this receipt. Please check every detail.");
    amount = capLow(amount);
    reference = capLow(reference);
    transactionDate = capLow(transactionDate);
  } else {
    if (amount.value === null && warnings.length === 0) warnings.push("Couldn't read the amount.");
    if (reference.value === null) warnings.push("Couldn't read the reference number.");
    if (transactionDate.value === null) warnings.push("Couldn't read the date and time.");
  }

  const needsReview = [amount, reference, transactionDate].some((f) => f.value === null || f.confidence === "low");
  return {
    provider,
    sendingApp: name,
    amountMinor: amount,
    reference,
    transactionDate,
    recipient: findRecipient(lines),
    warnings,
    needsReview,
  };
}
