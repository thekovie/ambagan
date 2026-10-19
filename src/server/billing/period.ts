/** Billing cycles are "YYYY-MM" strings in the app timezone (Asia/Manila), never UTC months. */

export const APP_TIMEZONE = "Asia/Manila";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function periodOf(date: Date, timeZone: string = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}`;
}

function split(period: string): [number, number] {
  const [year, month] = period.split("-").map(Number);
  return [year, month];
}

export function nextPeriod(period: string): string {
  const [year, month] = split(period);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** "October 2026" */
export function periodLabel(period: string): string {
  const [year, month] = split(period);
  return `${MONTHS[month - 1]} ${year}`;
}

/** "OCT": printed on the sachet stub. */
export function periodStub(period: string): string {
  return MONTHS[split(period)[1] - 1].slice(0, 3).toUpperCase();
}
