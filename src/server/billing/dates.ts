// Asia/Manila is a fixed UTC+8 with no daylight saving, so a literal offset is exact.
import { manilaDateKey } from "./period";

const pad = (n: number) => String(n).padStart(2, "0");

/** Start of the issue day (00:00 Manila) of a "YYYY-MM" billing period. */
export function issueDateOf(period: string, issueDay: number): Date {
  return new Date(`${period}-${pad(issueDay)}T00:00:00.000+08:00`);
}

/**
 * The last millisecond of a calendar day ("YYYY-MM-DD") in Manila: the same convention as a monthly due date, so a bill
 * is on time all through its due day. Null when the text is not a real date (including "2026-02-30").
 */
export function endOfManilaDay(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T23:59:59.999+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  return manilaDateKey(date) === day ? date : null;
}

/** The last millisecond of the due day (23:59:59.999 Manila). A payment on the due day is on time. */
export function dueDateOf(period: string, dueDay: number): Date {
  return new Date(`${period}-${pad(dueDay)}T23:59:59.999+08:00`);
}
