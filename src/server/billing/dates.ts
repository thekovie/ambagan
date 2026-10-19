// Asia/Manila is a fixed UTC+8 with no daylight saving, so a literal offset is exact.

const pad = (n: number) => String(n).padStart(2, "0");

/** Start of the issue day (00:00 Manila) of a "YYYY-MM" billing period. */
export function issueDateOf(period: string, issueDay: number): Date {
  return new Date(`${period}-${pad(issueDay)}T00:00:00.000+08:00`);
}

/** The last millisecond of the due day (23:59:59.999 Manila). A payment on the due day is on time. */
export function dueDateOf(period: string, dueDay: number): Date {
  return new Date(`${period}-${pad(dueDay)}T23:59:59.999+08:00`);
}
