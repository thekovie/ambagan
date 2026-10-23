import { and, eq, isNull, lte } from "drizzle-orm";
import { recordAudit } from "@/server/audit";
import type { Db } from "@/server/db/client";
import { memberships, statements, subscriptions, users } from "@/server/db/schema";
import { dueDateOf } from "./dates";
import { applyPenalties, collectPenalties } from "./penalty";
import { generateReference, isReferenceCollision, referenceSuffix } from "./reference";

type Plan = typeof subscriptions.$inferSelect;

const asDb = (tx: unknown) => tx as Db;
const MAX_REFERENCE_ATTEMPTS = 5;

interface GenerateInput {
  /** Billing cycle, "YYYY-MM" in Asia/Manila. */
  period: string;
  now?: Date;
  actorId: string | null;
  /** Limit to one plan (manual runs); default is every active plan. */
  subscriptionId?: string;
  /** Test seam for forcing reference collisions. */
  suffix?: () => string;
}

export interface GenerateResult {
  created: number;
  /** Cycles that already had a statement (including cancelled ones): left exactly as they were. */
  existing: number;
}

function insertStatement(t: Db, plan: Plan, userId: string, input: GenerateInput, now: Date): "created" | "existing" {
  // One monthly statement per member, plan and cycle (cancelled ones count too): this is what makes generation
  // idempotent. It is checked here rather than with ON CONFLICT because that unique index is partial (it ignores
  // ambag statements) and SQLite cannot target a partial index from `on conflict do nothing`. The caller holds the
  // write lock for the whole run, so nothing can slip in between this check and the insert; the index is the backstop.
  const already = t
    .select({ id: statements.id })
    .from(statements)
    .where(
      and(
        eq(statements.userId, userId),
        eq(statements.subscriptionId, plan.id),
        eq(statements.period, input.period),
        isNull(statements.billId),
      ),
    )
    .get();
  if (already) return "existing";

  // Late penalties from this member's earlier statements on this plan ride along on the new one, as a separate part of the total.
  const carried = collectPenalties(t, plan, userId, input.period, now);

  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
    try {
      const row = t
        .insert(statements)
        .values({
          reference: generateReference(plan.refPrefix, input.period, input.suffix ?? referenceSuffix),
          userId,
          subscriptionId: plan.id,
          period: input.period,
          // Snapshot: later fee or name changes never touch an issued statement.
          subscriptionName: plan.name,
          amountMinor: plan.feeMinor + carried.totalMinor,
          penaltyMinor: carried.totalMinor,
          outstandingMinor: plan.feeMinor + carried.totalMinor,
          currency: plan.currency,
          issuedAt: now,
          dueAt: dueDateOf(input.period, plan.dueDay),
        })
        .returning({ id: statements.id })
        .get();
      if (row) applyPenalties(t, carried, row.id, input.actorId, now);
      return row ? "created" : "existing";
    } catch (error) {
      // A random reference collided with an existing one: draw again. Anything else is a real failure.
      if (!isReferenceCollision(error)) throw error;
    }
  }
  throw new Error("Could not generate a unique statement reference");
}

/**
 * Issues the statements for one billing cycle. Safe to run any number of times: existing
 * statements are never modified, duplicated or replaced. Only active members of active plans,
 * from their first billable period on, are billed.
 */
export function generateStatements(db: Db, input: GenerateInput): GenerateResult {
  const now = input.now ?? new Date();

  return db.transaction((tx): GenerateResult => {
    const t = asDb(tx);
    const plans = t
      .select()
      .from(subscriptions)
      .where(
        input.subscriptionId
          ? and(eq(subscriptions.isActive, true), eq(subscriptions.kind, "RECURRING"), eq(subscriptions.id, input.subscriptionId))
          : and(eq(subscriptions.isActive, true), eq(subscriptions.kind, "RECURRING")),
      )
      .all();

    let created = 0;
    let existing = 0;
    for (const plan of plans) {
      const billable = t
        .select({ userId: memberships.userId })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.subscriptionId, plan.id),
            eq(memberships.isActive, true),
            eq(users.isActive, true),
            lte(memberships.startPeriod, input.period),
          ),
        )
        .all();
      for (const { userId } of billable) {
        if (insertStatement(t, plan, userId, input, now) === "created") created++;
        else existing++;
      }
    }

    if (created > 0) {
      recordAudit(t, {
        actorId: input.actorId,
        action: "statements.generated",
        entityType: "billing_period",
        entityId: input.period,
        metadata: { period: input.period, created, existing, subscriptionId: input.subscriptionId ?? null },
      });
    }
    return { created, existing };
  }, { behavior: "immediate" });
}
