import { eq, and } from "drizzle-orm";
import { effectiveStatus } from "@/lib/statement-view";
import type { Db } from "@/server/db/client";
import { memberships, payments, statements, subscriptions, users } from "@/server/db/schema";
import { issueDateOf } from "./dates";
import { nextPeriod, periodLabel, periodOf } from "./period";
import { listStatementsForUser, type Statement } from "./statements";

export interface UpcomingStatement {
  planName: string;
  /** "YYYY-MM" of the statement that will be issued next. */
  period: string;
  issueOn: Date;
  feeMinor: number;
  currency: string;
}

export type ActivityKind = "statement_issued" | "payment_submitted" | "payment_approved" | "payment_declined";

export interface ActivityItem {
  at: Date;
  kind: ActivityKind;
  label: string;
  statementId: string;
}

export interface MemberDashboard {
  /** The statement to act on (or, when all is settled, the latest one). */
  primary: Statement | null;
  /** Other statements still outstanding, oldest first. */
  attention: Statement[];
  /** A few earlier statements for history, newest first. */
  recent: Statement[];
  /** What still needs paying in all (not what is already reported and waiting for the admin), or null when nothing does. */
  owing: { count: number; totalMinor: number; currency: string } | null;
  upcoming: UpcomingStatement[];
  activity: ActivityItem[];
}

const RECENT_LIMIT = 4;
const DEFAULT_ACTIVITY_LIMIT = 6;

const byPeriodAsc = (a: Statement, b: Statement) => a.period.localeCompare(b.period);

function nextStatements(db: Db, userId: string, issued: Statement[], now: Date): UpcomingStatement[] {
  const rows = db
    .select({ membership: memberships, plan: subscriptions })
    .from(memberships)
    .innerJoin(subscriptions, eq(subscriptions.id, memberships.subscriptionId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(eq(memberships.userId, userId), eq(memberships.isActive, true), eq(subscriptions.isActive, true), eq(users.isActive, true)),
    )
    .all();
  const issuedKeys = new Set(issued.map((st) => `${st.subscriptionId}:${st.period}`));

  return rows
    .map(({ membership, plan }) => {
      // This month if its issue day is still ahead, otherwise next month; never before the membership starts.
      let period = periodOf(now);
      if (issueDateOf(period, plan.issueDay) <= now) period = nextPeriod(period);
      if (period < membership.startPeriod) period = membership.startPeriod;
      while (issuedKeys.has(`${plan.id}:${period}`)) period = nextPeriod(period);
      return {
        planName: plan.name,
        period,
        issueOn: issueDateOf(period, plan.issueDay),
        feeMinor: plan.feeMinor,
        currency: plan.currency,
      };
    })
    .sort((a, b) => a.issueOn.getTime() - b.issueOn.getTime());
}

function activityFor(db: Db, userId: string, all: Statement[], limit: number): ActivityItem[] {
  const items: ActivityItem[] = all.map((st) => ({
    at: st.issuedAt,
    kind: "statement_issued",
    label: st.billId ? `Ambag issued: ${st.subscriptionName}` : `Statement issued for ${periodLabel(st.period)}`,
    statementId: st.id,
  }));

  const rows = db
    .select({ payment: payments, period: statements.period, billId: statements.billId, title: statements.subscriptionName })
    .from(payments)
    .innerJoin(statements, eq(statements.id, payments.statementId))
    .where(eq(payments.userId, userId))
    .all();
  for (const { payment, period, billId, title } of rows) {
    const month = billId ? title : periodLabel(period);
    items.push({
      at: payment.submittedAt,
      kind: "payment_submitted",
      label: `You reported a payment for ${month}`,
      statementId: payment.statementId,
    });
    if (payment.reviewedAt && payment.status === "APPROVED") {
      items.push({ at: payment.reviewedAt, kind: "payment_approved", label: `Payment approved for ${month}`, statementId: payment.statementId });
    }
    if (payment.reviewedAt && payment.status === "DECLINED") {
      items.push({ at: payment.reviewedAt, kind: "payment_declined", label: `Payment declined for ${month}`, statementId: payment.statementId });
    }
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** Everything the member dashboard shows, for one member (never anyone else's data). */
export function getMemberDashboard(
  db: Db,
  userId: string,
  now = new Date(),
  options: { activityLimit?: number } = {},
): MemberDashboard {
  const all = listStatementsForUser(db, userId); // newest first
  const status = (st: Statement) => effectiveStatus(st, now);

  // Needs-payment statements come first, oldest first, then the ones already reported and waiting for the admin.
  const needsPayment = all.filter((st) => ["UNPAID", "OVERDUE"].includes(status(st))).sort(byPeriodAsc);
  const verifying = all.filter((st) => st.status === "UNDER_VERIFICATION").sort(byPeriodAsc);
  const outstanding = [...needsPayment, ...verifying];

  const primary = outstanding[0] ?? all.find((st) => st.status !== "CANCELLED") ?? null;
  const attention = outstanding.slice(1);
  const shown = new Set([primary?.id, ...attention.map((st) => st.id)]);

  return {
    primary,
    attention,
    recent: all.filter((st) => !shown.has(st.id)).slice(0, RECENT_LIMIT),
    owing: needsPayment.length === 0 ? null : { count: needsPayment.length, totalMinor: needsPayment.reduce((sum, st) => sum + st.outstandingMinor, 0), currency: needsPayment[0].currency },
    upcoming: nextStatements(db, userId, all, now),
    activity: activityFor(db, userId, all, options.activityLimit ?? DEFAULT_ACTIVITY_LIMIT),
  };
}
