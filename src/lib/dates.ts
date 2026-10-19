/** Display formats. Everything the app shows is in Asia/Manila time, regardless of the viewer's device. */

const TIMEZONE = "Asia/Manila";

const short = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short", month: "short", day: "numeric" });
const long = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, year: "numeric", month: "long", day: "numeric" });
const dateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// Newer ICU versions put a narrow no-break space before AM/PM; keep output plain and predictable.
const plain = (text: string) => text.replace(/ /g, " ");

const hourInManila = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hour: "numeric", hourCycle: "h23" });

/** "Good morning" / "Good afternoon" / "Good evening" by the hour in Manila. */
export function greeting(date: Date): string {
  const hour = Number(hourInManila.format(date));
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "Sat, Oct 10" */
export const formatDate = (date: Date): string => plain(short.format(date));

/** "October 10, 2026" */
export const formatLongDate = (date: Date): string => plain(long.format(date));

/** "Oct 10, 2026, 11:59 PM" */
export const formatDateTime = (date: Date): string => plain(dateTime.format(date));
