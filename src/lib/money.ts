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

/** Parses "50", "50.5", "₱1,234.56" to centavos; null when invalid or finer than 0.01. */
export function parsePesosToMinor(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, whole, frac = ""] = match;
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
