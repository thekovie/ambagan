import { and, eq, lte } from "drizzle-orm";
import { recordAudit } from "@/server/audit";
import type { Db } from "@/server/db/client";
import { memberships, statements, subscriptions, users } from "@/server/db/schema";
import { dueDateOf } from "./dates";
import { generateReference, referenceSuffix } from "./reference";

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

/** better-sqlite3 reports a duplicate reference as SQLITE_CONSTRAINT_UNIQUE naming the column. */
function isReferenceCollision(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  return (code === undefined || code === "SQLITE_CONSTRAINT_UNIQUE") && error.message.includes("statement.reference");
}

function insertStatement(t: Db, plan: Plan, userId: string, input: GenerateInput, now: Date): "created" | "existing" {
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
          amountMinor: plan.feeMinor,
          outstandingMinor: plan.feeMinor,
          currency: plan.currency,
          issuedAt: now,
          dueAt: dueDateOf(input.period, plan.dueDay),
        })
        // One statement per member, plan and cycle: this is what makes generation idempotent.
        .onConflictDoNothing({ target: [statements.userId, statements.subscriptionId, statements.period] })
        .returning({ id: statements.id })
        .get();
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
          ? and(eq(subscriptions.isActive, true), eq(subscriptions.id, input.subscriptionId))
          : eq(subscriptions.isActive, true),
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
