import { and, eq, inArray, lte } from "drizzle-orm";
import { generateStatements } from "@/server/billing/generate";
import { daysBetween, manilaDateKey, previousPeriod } from "@/server/billing/period";
import { markOverdue } from "@/server/billing/statements";
import type { Db } from "@/server/db/client";
import { statements, subscriptions } from "@/server/db/schema";
import { notifyStatementEvent } from "@/server/email/notify";
import { pruneEmails } from "@/server/email/queue";
import { pruneJobRuns } from "./runner";

/** A "new statement" email is still sent for a statement issued this recently (dedupe keeps it to once). */
const NEW_STATEMENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** The first overdue notice comes the day after the due day, then repeats this often, up to a maximum. */
const OVERDUE_REPEAT_DAYS = 7;
const MAX_OVERDUE_NOTICES = 4;
const EMAIL_RETENTION_DAYS = 90;
const JOB_RETENTION_DAYS = 90;

export interface ReconcileSummary {
  /** The Manila billing month this run looked at. */
  period: string;
  created: number;
  markedOverdue: number;
  /** New-statement and reminder emails newly queued by this run. */
  queued: number;
  prunedEmails: number;
  prunedJobRuns: number;
  [key: string]: unknown;
}

/** Which reminder, if any, a statement is due for today. `key` makes the notice unique per occurrence. */
function reminderFor(dueAt: Date, today: string): { type: "DUE_TOMORROW" | "DUE_TODAY" | "OVERDUE"; key: string } | null {
  const daysToDue = daysBetween(today, manilaDateKey(dueAt));
  if (daysToDue === 1) return { type: "DUE_TOMORROW", key: "DUE_TOMORROW" };
  if (daysToDue === 0) return { type: "DUE_TODAY", key: "DUE_TODAY" };
  const daysLate = -daysToDue;
  const noticeNumber = (daysLate - 1) / OVERDUE_REPEAT_DAYS;
  if (daysLate >= 1 && Number.isInteger(noticeNumber) && noticeNumber < MAX_OVERDUE_NOTICES) return { type: "OVERDUE", key: `OVERDUE:${daysLate}` };
  return null;
}

/**
 * The daily job. Every step is idempotent, so it is safe to run twice, to run late, or to run by hand:
 * 1. issue this month's statements for plans whose issue day has come (catching up after downtime),
 * 2. mark statements overdue once their due day has ended in Manila,
 * 3. queue "new statement" and due/overdue reminders, only for statements that still need paying
 *    (never paid, under verification or cancelled ones),
 * 4. prune old email log and job history rows.
 */
export function reconcile(db: Db, now: Date): ReconcileSummary {
  const today = manilaDateKey(now);
  const period = today.slice(0, 7);
  const dayOfMonth = Number(today.slice(8));

  let created = 0;
  const plans = db.select().from(subscriptions).where(and(eq(subscriptions.isActive, true), lte(subscriptions.issueDay, dayOfMonth))).all();
  for (const plan of plans) {
    created += generateStatements(db, { period, now, actorId: null, subscriptionId: plan.id }).created;
  }

  const markedOverdue = markOverdue(db, now);

  let queued = 0;
  const owing = db.select().from(statements).where(inArray(statements.status, ["UNPAID", "OVERDUE"])).all();
  for (const statement of owing) {
    // Only recent months are announced: a back-filled old month would read as news from the past.
    if (statement.period >= previousPeriod(period) && statement.issuedAt.getTime() >= now.getTime() - NEW_STATEMENT_WINDOW_MS) {
      queued += Number(notifyStatementEvent(db, { type: "SOA_GENERATED", statement, dedupeKey: `SOA_GENERATED:${statement.id}`, now }));
    }
    const reminder = reminderFor(statement.dueAt, today);
    if (reminder) {
      queued += Number(notifyStatementEvent(db, { type: reminder.type, statement, dedupeKey: `${reminder.key}:${statement.id}`, now }));
    }
  }

  return {
    period,
    created,
    markedOverdue,
    queued,
    prunedEmails: pruneEmails(db, now, EMAIL_RETENTION_DAYS),
    prunedJobRuns: pruneJobRuns(db, now, JOB_RETENTION_DAYS),
  };
}
