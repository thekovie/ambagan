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

/** The calendar day in Manila as "YYYY-MM-DD". */
export function manilaDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from one "YYYY-MM-DD" key to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function split(period: string): [number, number] {
  const [year, month] = period.split("-").map(Number);
  return [year, month];
}

export function previousPeriod(period: string): string {
  const [year, month] = split(period);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

export function nextPeriod(period: string): string {
  const [year, month] = split(period);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** How many months (current + previous) the admin can issue or review statements for. */
export const RECENT_PERIOD_COUNT = 12;

/** The current period and the `count - 1` before it, newest first. */
export function recentPeriods(now: Date, count: number): string[] {
  const periods = [periodOf(now)];
  while (periods.length < count) {
    const [year, month] = split(periods[periods.length - 1]);
    periods.push(month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`);
  }
  return periods;
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

/**
 * The first month a newly added (or reactivated) member should be billed for. Normally the current month, but once the
 * plan's due day has passed in Manila that month is already late: starting them next month avoids a statement that is
 * overdue the moment it is issued. The due day itself still counts as on time.
 */
export function firstBillablePeriod(now: Date, dueDay: number): string {
  const today = manilaDateKey(now);
  const period = today.slice(0, 7);
  return Number(today.slice(8)) > dueDay ? nextPeriod(period) : period;
}
