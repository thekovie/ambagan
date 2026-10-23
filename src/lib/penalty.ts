import { formatMinor } from "@/lib/money";

/** "every day", "every 2 days", "every week": how often one penalty charge is added while a statement is late. */
export function everyLabel(everyDays: number): string {
  if (everyDays === 1) return "every day";
  if (everyDays === 7) return "every week";
  return `every ${everyDays} days`;
}

/** "₱10.00 every 2 days late, up to ₱50.00", or null when the plan has no penalty. Safe for client bundles. */
export function describePenalty(rule: { amountMinor: number; everyDays: number; capMinor: number | null }, currency = "PHP"): string | null {
  if (rule.amountMinor <= 0) return null;
  const limit = rule.capMinor ? `, up to ${formatMinor(rule.capMinor, currency)}` : "";
  return `${formatMinor(rule.amountMinor, currency)} ${everyLabel(rule.everyDays)} late${limit}`;
}
