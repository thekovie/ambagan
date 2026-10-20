import { and, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import { recordAudit } from "@/server/audit";
import type { StatementStatus } from "@/lib/enums";
import type { Db } from "@/server/db/client";
import { statements, users } from "@/server/db/schema";

export type Statement = typeof statements.$inferSelect;

const asDb = (tx: unknown) => tx as Db;

/**
 * UNPAID statements whose due day has fully ended become OVERDUE. Statements under
 * verification stay as they are: the member has paid and is waiting on the admin.
 */
export function markOverdue(db: Db, now = new Date()): number {
  return db
    .update(statements)
    .set({ status: "OVERDUE" })
    .where(and(eq(statements.status, "UNPAID"), lt(statements.dueAt, now)))
    .run().changes;
}

export type CancelResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" | "REASON_REQUIRED" | "REASON_TOO_LONG" | "NOT_CANCELLABLE" };

export const MIN_REASON_LENGTH = 3;
export const MAX_REASON_LENGTH = 200;
export const CANCELLABLE: StatementStatus[] = ["UNPAID", "OVERDUE"];

/**
 * Cancels a statement nobody has paid or reported paying. The amount is kept for history,
 * the outstanding balance drops to zero, and the cycle stays used (it is never regenerated).
 */
export function cancelStatement(
  db: Db,
  input: { statementId: string; actorId: string; reason: string; now?: Date },
): CancelResult {
  // "immediate": take the write lock up front, so a second writer waits (busy_timeout) instead of failing mid-transaction.
  return db.transaction((tx) => cancelStatementIn(asDb(tx), input), { behavior: "immediate" });
}

/** The same cancellation for a caller that already holds the write transaction (cancelling a whole bill at once). */
export function cancelStatementIn(
  t: Db,
  input: { statementId: string; actorId: string; reason: string; now?: Date },
): CancelResult {
  const reason = input.reason.trim();
  const now = input.now ?? new Date();

  const current = t.select().from(statements).where(eq(statements.id, input.statementId)).get();
  if (!current) return { ok: false, error: "NOT_FOUND" };
  if (!CANCELLABLE.includes(current.status)) return { ok: false, error: "NOT_CANCELLABLE" };
  if (reason.length < MIN_REASON_LENGTH) return { ok: false, error: "REASON_REQUIRED" };
  if (reason.length > MAX_REASON_LENGTH) return { ok: false, error: "REASON_TOO_LONG" };

  // The status check is repeated in the UPDATE so two admins can't both "win" a race.
  const updated = t
    .update(statements)
    .set({ status: "CANCELLED", outstandingMinor: 0, cancelledAt: now, cancelReason: reason })
    .where(and(eq(statements.id, current.id), inArray(statements.status, CANCELLABLE)))
    .returning({ id: statements.id })
    .get();
  if (!updated) return { ok: false, error: "NOT_CANCELLABLE" };

  recordAudit(t, {
    actorId: input.actorId,
    action: "statement.cancelled",
    entityType: "statement",
    entityId: current.id,
    metadata: { reason, previousStatus: current.status, reference: current.reference, amountMinor: current.amountMinor },
  });
  return { ok: true };
}

/** Ownership is part of the query: another member's statement id simply returns null. */
export function getStatementForUser(db: Db, userId: string, statementId: string): Statement | null {
  return (
    db
      .select()
      .from(statements)
      .where(and(eq(statements.id, statementId), eq(statements.userId, userId)))
      .get() ?? null
  );
}

/** Newest cycle first; cancelled statements stay visible for history. */
export function listStatementsForUser(db: Db, userId: string): Statement[] {
  return db
    .select()
    .from(statements)
    .where(eq(statements.userId, userId))
    .orderBy(desc(statements.period), desc(statements.createdAt))
    .all();
}

export interface StatementFilters {
  period?: string;
  status?: StatementStatus;
  userId?: string;
  subscriptionId?: string;
  /** "Now" for the overdue rule below; defaults to the current time. */
  now?: Date;
  /** Row cap (default 500) so the admin list can't grow without bound. */
  limit?: number;
}

export type AdminStatementRow = Statement & { memberName: string | null; memberEmail: string };

/**
 * Status filters follow what the UI displays: an UNPAID statement past its due day counts as
 * OVERDUE even before the daily job persists it (see effectiveStatus in lib/statement-view).
 */
function statusCondition(status: StatementStatus | undefined, now: Date) {
  if (status === "UNPAID") return and(eq(statements.status, "UNPAID"), gte(statements.dueAt, now));
  if (status === "OVERDUE") {
    return or(eq(statements.status, "OVERDUE"), and(eq(statements.status, "UNPAID"), lt(statements.dueAt, now)));
  }
  return status ? eq(statements.status, status) : undefined;
}

export function listStatements(db: Db, filters: StatementFilters): AdminStatementRow[] {
  const conditions = [
    filters.period ? eq(statements.period, filters.period) : undefined,
    statusCondition(filters.status, filters.now ?? new Date()),
    filters.userId ? eq(statements.userId, filters.userId) : undefined,
    filters.subscriptionId ? eq(statements.subscriptionId, filters.subscriptionId) : undefined,
  ].filter((c) => c !== undefined);

  return db
    .select({ statement: statements, memberName: users.name, memberEmail: users.email })
    .from(statements)
    .innerJoin(users, eq(users.id, statements.userId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(statements.period), users.email)
    .limit(filters.limit ?? 500)
    .all()
    .map((r) => ({ ...r.statement, memberName: r.memberName, memberEmail: r.memberEmail }));
}
