import { and, desc, eq, gt, gte, inArray, isNull, lt } from "drizzle-orm";
import type { PaymentStatus, StatementStatus } from "@/lib/enums";
import { displayEmail } from "@/lib/guest";
import { recordAudit } from "@/server/audit";
import type { Db } from "@/server/db/client";
import { payments, penalties, statements, subscriptions, users } from "@/server/db/schema";
import { daysBetween, manilaDateKey } from "./period";

type Plan = typeof subscriptions.$inferSelect;

const asDb = (tx: unknown) => tx as Db;

/** What the admin sets on a plan: `amountMinor` for every `everyDays` days late, never more than `capMinor` in total. */
export interface PenaltyRule {
  amountMinor: number;
  everyDays: number;
  capMinor: number | null;
}

export const ruleOf = (plan: Plan): PenaltyRule => ({ amountMinor: plan.penaltyMinor, everyDays: plan.penaltyEveryDays, capMinor: plan.penaltyCapMinor });

/** A plan penalises only once the admin has switched it on (`penaltySince` says when). */
const isOn = (plan: Plan) => plan.penaltyMinor > 0 && plan.penaltySince !== null;

/** One charge for every full `everyDays` days late ("every 2 days": nothing on day 1, one charge on day 2, two on day 4). */
export function penaltyFor(lateDays: number, rule: PenaltyRule): number {
  if (rule.amountMinor <= 0 || lateDays <= 0) return 0;
  const total = Math.floor(lateDays / Math.max(1, rule.everyDays)) * rule.amountMinor;
  return rule.capMinor === null ? total : Math.min(total, rule.capMinor);
}

export interface ReportedPayment {
  status: PaymentStatus;
  submittedAt: Date;
  reviewedAt: Date | null;
}

/**
 * Days a statement was late, counted in Manila days after its due day. Counting stops the day the member reported
 * paying (a report that stands: waiting or approved), and the days a report spent waiting before the admin declined it
 * are not held against the member. A cancelled statement is never late.
 */
export function lateDaysOf(input: { dueAt: Date; status: StatementStatus; now: Date; payments: ReportedPayment[] }): number {
  if (input.status === "CANCELLED") return 0;
  const dueKey = manilaDateKey(input.dueAt);
  const standing = input.payments.filter((p) => p.status !== "DECLINED").sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0];
  // A statement marked paid with no report on file cannot be dated, so it is not penalised.
  if (!standing && input.status === "PAID") return 0;
  const endKey = standing ? manilaDateKey(standing.submittedAt) : manilaDateKey(input.now);

  let late = daysBetween(dueKey, endKey);
  for (const declined of input.payments) {
    if (declined.status !== "DECLINED" || !declined.reviewedAt) continue;
    const from = [manilaDateKey(declined.submittedAt), dueKey].sort().at(-1)!;
    const to = [manilaDateKey(declined.reviewedAt), endKey].sort()[0];
    late -= Math.max(0, daysBetween(from, to));
  }
  return Math.max(0, late);
}

interface Scope {
  userId?: string;
  subscriptionId?: string;
}

/**
 * Brings every building-up penalty up to date: one row per late monthly statement of a plan that has a penalty, for
 * statements due after the penalty was switched on. A penalty that is already on a statement, or waived, is left alone.
 * Idempotent, so the daily job can run it any number of times.
 */
export function accruePenalties(db: Db, now: Date, scope: Scope = {}): number {
  return db.transaction((tx) => accrueIn(asDb(tx), now, scope), { behavior: "immediate" });
}

function accrueIn(t: Db, now: Date, scope: Scope): number {
  const candidates = t
    .select({ statement: statements, plan: subscriptions })
    .from(statements)
    .innerJoin(subscriptions, eq(subscriptions.id, statements.subscriptionId))
    .where(
      and(
        eq(subscriptions.kind, "RECURRING"),
        gt(subscriptions.penaltyMinor, 0),
        isNull(statements.billId),
        lt(statements.dueAt, now),
        gte(statements.dueAt, subscriptions.penaltySince),
        scope.userId ? eq(statements.userId, scope.userId) : undefined,
        scope.subscriptionId ? eq(statements.subscriptionId, scope.subscriptionId) : undefined,
      ),
    )
    .all();
  if (candidates.length === 0) return 0;

  const ids = candidates.map((c) => c.statement.id);
  const existing = new Map(t.select().from(penalties).where(inArray(penalties.statementId, ids)).all().map((p) => [p.statementId, p]));
  const reports = new Map<string, ReportedPayment[]>();
  for (const p of t.select({ statementId: payments.statementId, status: payments.status, submittedAt: payments.submittedAt, reviewedAt: payments.reviewedAt }).from(payments).where(inArray(payments.statementId, ids)).all()) {
    reports.set(p.statementId, [...(reports.get(p.statementId) ?? []), p]);
  }

  let changed = 0;
  for (const { statement, plan } of candidates) {
    const row = existing.get(statement.id);
    if (row && (row.appliedToStatementId || row.waivedAt)) continue;
    const lateDays = lateDaysOf({ dueAt: statement.dueAt, status: statement.status, now, payments: reports.get(statement.id) ?? [] });
    const amountMinor = penaltyFor(lateDays, ruleOf(plan));
    if (!row) {
      if (amountMinor === 0) continue;
      t.insert(penalties).values({ statementId: statement.id, userId: statement.userId, amountMinor, lateDays }).run();
      changed++;
    } else if (row.amountMinor !== amountMinor || row.lateDays !== lateDays) {
      t.update(penalties).set({ amountMinor, lateDays, updatedAt: now }).where(eq(penalties.id, row.id)).run();
      changed++;
    }
  }
  return changed;
}

export interface CarriedPenalties {
  ids: string[];
  totalMinor: number;
}

/**
 * The penalties a member's new monthly statement for `period` will carry: those of their earlier statements on the
 * same plan that are still building up, brought up to date first. The caller adds `totalMinor` to the statement and
 * then calls `applyPenalties` in the same transaction.
 */
export function collectPenalties(t: Db, plan: Plan, userId: string, period: string, now: Date): CarriedPenalties {
  if (!isOn(plan)) return { ids: [], totalMinor: 0 };
  accrueIn(t, now, { userId, subscriptionId: plan.id });
  const rows = t
    .select({ id: penalties.id, amountMinor: penalties.amountMinor })
    .from(penalties)
    .innerJoin(statements, eq(statements.id, penalties.statementId))
    .where(
      and(
        eq(penalties.userId, userId),
        eq(statements.subscriptionId, plan.id),
        lt(statements.period, period),
        isNull(penalties.appliedToStatementId),
        isNull(penalties.waivedAt),
        gt(penalties.amountMinor, 0),
      ),
    )
    .all();
  return { ids: rows.map((r) => r.id), totalMinor: rows.reduce((sum, r) => sum + r.amountMinor, 0) };
}

/** Records that the new statement carries these penalties, which freezes their amounts. */
export function applyPenalties(t: Db, carried: CarriedPenalties, statementId: string, actorId: string | null, now: Date): void {
  if (carried.ids.length === 0) return;
  t.update(penalties).set({ appliedToStatementId: statementId, updatedAt: now }).where(inArray(penalties.id, carried.ids)).run();
  recordAudit(t, { actorId, action: "penalty.applied", entityType: "statement", entityId: statementId, metadata: { penaltyMinor: carried.totalMinor, count: carried.ids.length } });
}

export type WaiveResult = { ok: true } | { ok: false; error: "NOT_FOUND" | "ALREADY_ON_STATEMENT" };

/** Excuses a penalty that has not landed on a statement yet. */
export function waivePenalty(db: Db, input: { penaltyId: string; actorId: string; now?: Date }): WaiveResult {
  const now = input.now ?? new Date();
  return db.transaction((tx): WaiveResult => {
    const t = asDb(tx);
    const row = t.select().from(penalties).where(eq(penalties.id, input.penaltyId)).get();
    if (!row) return { ok: false, error: "NOT_FOUND" };
    if (row.appliedToStatementId) return { ok: false, error: "ALREADY_ON_STATEMENT" };
    if (row.waivedAt) return { ok: true };
    t.update(penalties).set({ waivedAt: now, updatedAt: now }).where(eq(penalties.id, row.id)).run();
    recordAudit(t, { actorId: input.actorId, action: "penalty.waived", entityType: "penalty", entityId: row.id, metadata: { amountMinor: row.amountMinor, statementId: row.statementId } });
    return { ok: true };
  }, { behavior: "immediate" });
}

export type RemoveLateFeeResult = { ok: true } | { ok: false; error: "NOT_FOUND" | "NO_LATE_FEE" | "NOT_EDITABLE" };

/**
 * Takes the late fees off a statement nobody has paid or reported paying yet, and excuses them for good.
 * (Once a payment is waiting or approved the amount is part of that payment's check and no longer changes.)
 */
export function removeLateFee(db: Db, input: { statementId: string; actorId: string; now?: Date }): RemoveLateFeeResult {
  const now = input.now ?? new Date();
  return db.transaction((tx): RemoveLateFeeResult => {
    const t = asDb(tx);
    const current = t.select().from(statements).where(eq(statements.id, input.statementId)).get();
    if (!current) return { ok: false, error: "NOT_FOUND" };
    if (current.penaltyMinor <= 0) return { ok: false, error: "NO_LATE_FEE" };
    if (current.status !== "UNPAID" && current.status !== "OVERDUE") return { ok: false, error: "NOT_EDITABLE" };
    t.update(statements)
      .set({ amountMinor: current.amountMinor - current.penaltyMinor, outstandingMinor: current.outstandingMinor - current.penaltyMinor, penaltyMinor: 0 })
      .where(eq(statements.id, current.id))
      .run();
    t.update(penalties).set({ waivedAt: now, updatedAt: now }).where(eq(penalties.appliedToStatementId, current.id)).run();
    recordAudit(t, { actorId: input.actorId, action: "penalty.removed", entityType: "statement", entityId: current.id, metadata: { removedMinor: current.penaltyMinor, reference: current.reference } });
    return { ok: true };
  }, { behavior: "immediate" });
}

export interface PendingPenaltyRow {
  id: string;
  memberName: string | null;
  memberEmail: string;
  reference: string;
  planName: string;
  period: string;
  lateDays: number;
  amountMinor: number;
  /** True while the statement is still unpaid, so the amount can still grow. */
  stillLate: boolean;
}

/** Penalties building up that will go onto each member's next monthly statement, biggest first. */
export function listPendingPenalties(db: Db): PendingPenaltyRow[] {
  return db
    .select({
      id: penalties.id,
      memberName: users.name,
      memberEmail: users.email,
      reference: statements.reference,
      planName: statements.subscriptionName,
      period: statements.period,
      lateDays: penalties.lateDays,
      amountMinor: penalties.amountMinor,
      status: statements.status,
    })
    .from(penalties)
    .innerJoin(statements, eq(statements.id, penalties.statementId))
    .innerJoin(subscriptions, eq(subscriptions.id, statements.subscriptionId))
    .innerJoin(users, eq(users.id, penalties.userId))
    .where(and(isNull(penalties.appliedToStatementId), isNull(penalties.waivedAt), gt(penalties.amountMinor, 0), gt(subscriptions.penaltyMinor, 0)))
    .orderBy(desc(penalties.amountMinor))
    .all()
    .map(({ status, memberEmail, ...row }) => ({ ...row, memberEmail: displayEmail(memberEmail), stillLate: status === "UNPAID" || status === "OVERDUE" }));
}

/** What a statement has collected so far in penalties that have not landed anywhere yet (null when none). */
export function buildingPenaltyFor(db: Db, statementId: string): number | null {
  const row = db
    .select({ amountMinor: penalties.amountMinor })
    .from(penalties)
    .where(and(eq(penalties.statementId, statementId), isNull(penalties.appliedToStatementId), isNull(penalties.waivedAt), gt(penalties.amountMinor, 0)))
    .get();
  return row?.amountMinor ?? null;
}
