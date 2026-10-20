import { and, count, countDistinct, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { StatementStatus } from "@/lib/enums";
import { effectiveStatus } from "@/lib/statement-view";
import type { Db } from "@/server/db/client";
import { memberships, payments, statements, subscriptions, users } from "@/server/db/schema";
import { periodOf } from "./period";
import type { Statement } from "./statements";

export interface OverviewTicket {
  statement: Statement;
  memberName: string;
  /** The status members see (unpaid past its due day reads as overdue). */
  status: StatementStatus;
}

export interface AdminOverview {
  /** Current billing cycle, "YYYY-MM" in Manila. */
  period: string;
  activeMembers: number;
  cycle: {
    /** Non-cancelled statements issued for this cycle. */
    count: number;
    chargedMinor: number;
    /** Approved payments against this cycle's statements. */
    collectedMinor: number;
    paidCount: number;
  };
  /** Still owed across every month (ambag bills included). */
  outstandingMinor: number;
  /** Ambag statements still waiting for money or for the admin's check. */
  ambagOpen: number;
  pendingVerification: number;
  overdueCount: number;
  /** One per member for this cycle, worst first. */
  tickets: OverviewTicket[];
}

// Lower sorts first: what needs the admin's eye leads.
const SEVERITY: Record<StatementStatus, number> = { OVERDUE: 0, UNPAID: 1, UNDER_VERIFICATION: 2, PAID: 3, CANCELLED: 4 };

const sumOf = (column: Parameters<typeof sql>[1]) => sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);

export function getAdminOverview(db: Db, now = new Date()): AdminOverview {
  const period = periodOf(now);

  const activeMembers =
    db
      .select({ n: countDistinct(memberships.userId) })
      .from(memberships)
      .innerJoin(subscriptions, eq(subscriptions.id, memberships.subscriptionId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.isActive, true), eq(subscriptions.isActive, true), eq(users.isActive, true)))
      .get()?.n ?? 0;

  const cycleRows = db
    .select({ statement: statements, name: users.name, email: users.email })
    .from(statements)
    .innerJoin(users, eq(users.id, statements.userId))
    .where(and(eq(statements.period, period), ne(statements.status, "CANCELLED"), isNull(statements.billId)))
    .all();

  const collectedMinor =
    db
      .select({ total: sumOf(payments.amountMinor) })
      .from(payments)
      .innerJoin(statements, eq(statements.id, payments.statementId))
      .where(and(eq(payments.status, "APPROVED"), eq(statements.period, period), isNull(statements.billId)))
      .get()?.total ?? 0;

  const outstandingMinor = db.select({ total: sumOf(statements.outstandingMinor) }).from(statements).get()?.total ?? 0;

  const ambagOpen =
    db
      .select({ n: count() })
      .from(statements)
      .where(and(isNotNull(statements.billId), inArray(statements.status, ["UNPAID", "OVERDUE", "UNDER_VERIFICATION"])))
      .get()?.n ?? 0;

  const pendingVerification =
    db.select({ n: count() }).from(payments).where(eq(payments.status, "PENDING")).get()?.n ?? 0;

  const overdueCount =
    db
      .select({ n: count() })
      .from(statements)
      .where(or(eq(statements.status, "OVERDUE"), and(eq(statements.status, "UNPAID"), lt(statements.dueAt, now))))
      .get()?.n ?? 0;

  const tickets = cycleRows
    .map(({ statement, name, email }) => ({
      statement,
      memberName: name?.trim() || email,
      status: effectiveStatus(statement, now),
    }))
    .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || a.memberName.localeCompare(b.memberName));

  return {
    period,
    activeMembers,
    cycle: {
      count: cycleRows.length,
      chargedMinor: cycleRows.reduce((sum, r) => sum + r.statement.amountMinor, 0),
      collectedMinor,
      paidCount: cycleRows.filter((r) => r.statement.status === "PAID").length,
    },
    outstandingMinor,
    ambagOpen,
    pendingVerification,
    overdueCount,
    tickets,
  };
}
