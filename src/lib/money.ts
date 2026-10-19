/** Money is stored as integer minor units (centavos). Only format at the edge. */

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMinor(amountMinor: number, currency: string): string {
  let fmt = formatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-PH", { style: "currency", currency });
    formatters.set(currency, fmt);
  }
  return fmt.format(amountMinor / 100);
}

const THOUSANDS = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/;

/**
 * Parses "50", "50.5", "₱1,234.56" to centavos. Null when invalid, finer than 0.01, too large to
 * store exactly, or when a comma isn't a thousands separator ("50,50" is not 5050 pesos).
 */
export function parsePesosToMinor(input: string): number | null {
  const cleaned = input.replace(/[₱\s]/g, "");
  if (cleaned.includes(",") && !THOUSANDS.test(cleaned)) return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned.replace(/,/g, ""));
  if (!match) return null;
  const [, whole, frac = ""] = match;
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}
