import { asc, count, eq } from "drizzle-orm";
import { recordAudit } from "@/server/audit";
import type { Db } from "@/server/db/client";
import { memberships, subscriptions } from "@/server/db/schema";
import type { SubscriptionInput, SubscriptionUpdate } from "./form";

type SubscriptionRow = typeof subscriptions.$inferSelect;

const asDb = (tx: unknown) => tx as Db;

/** First run only: the initial Spotify plan from the brief. Never overwrites admin edits. */
export function seedDefaultSubscription(db: Db): void {
  if (db.select({ id: subscriptions.id }).from(subscriptions).limit(1).get()) return;
  db.insert(subscriptions)
    .values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 5000, currency: "PHP", issueDay: 1, dueDay: 10 })
    // Two processes opening a fresh DB at once: the loser simply does nothing.
    .onConflictDoNothing()
    .run();
}

export type CreateSubscriptionResult =
  | { ok: true; subscription: SubscriptionRow }
  | { ok: false; error: "PREFIX_TAKEN" };

export function createSubscription(db: Db, input: SubscriptionInput, actorId: string): CreateSubscriptionResult {
  return db.transaction((tx): CreateSubscriptionResult => {
    const t = asDb(tx);
    if (t.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.refPrefix, input.refPrefix)).get()) {
      return { ok: false, error: "PREFIX_TAKEN" };
    }
    const subscription = t.insert(subscriptions).values(input).returning().get();
    recordAudit(t, {
      actorId,
      action: "subscription.created",
      entityType: "subscription",
      entityId: subscription.id,
      metadata: { name: input.name, feeMinor: input.feeMinor },
    });
    return { ok: true, subscription };
  });
}

export type UpdateSubscriptionResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

const EDITABLE = ["name", "feeMinor", "issueDay", "dueDay", "paymentInstructions", "isActive"] as const;

/**
 * Edits the plan. Issued statements carry their own snapshot of name, amount and currency,
 * so a new fee only applies to statements generated afterwards.
 */
export function updateSubscription(
  db: Db,
  id: string,
  input: SubscriptionUpdate,
  actorId: string,
): UpdateSubscriptionResult {
  return db.transaction((tx): UpdateSubscriptionResult => {
    const t = asDb(tx);
    const current = t.select().from(subscriptions).where(eq(subscriptions.id, id)).get();
    if (!current) return { ok: false, error: "NOT_FOUND" };

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of EDITABLE) if (current[key] !== input[key]) changes[key] = { from: current[key], to: input[key] };
    if (Object.keys(changes).length === 0) return { ok: true };

    // Explicit fields (not `...input`): the refPrefix, or anything else extra at runtime, can never be written.
    t.update(subscriptions)
      .set({
        name: input.name,
        feeMinor: input.feeMinor,
        issueDay: input.issueDay,
        dueDay: input.dueDay,
        paymentInstructions: input.paymentInstructions,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, id))
      .run();
    recordAudit(t, { actorId, action: "subscription.updated", entityType: "subscription", entityId: id, metadata: { changes } });
    return { ok: true };
  });
}

export type SubscriptionListRow = SubscriptionRow & { activeMembers: number };

export function listSubscriptions(db: Db): SubscriptionListRow[] {
  const counts = new Map(
    db
      .select({ subscriptionId: memberships.subscriptionId, n: count() })
      .from(memberships)
      .where(eq(memberships.isActive, true))
      .groupBy(memberships.subscriptionId)
      .all()
      .map((r) => [r.subscriptionId, r.n]),
  );
  return db
    .select()
    .from(subscriptions)
    .orderBy(asc(subscriptions.createdAt))
    .all()
    .map((sub) => ({ ...sub, activeMembers: counts.get(sub.id) ?? 0 }));
}
