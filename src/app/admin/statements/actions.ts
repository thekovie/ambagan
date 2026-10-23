"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { requireAdmin } from "@/server/auth/session";
import { generateStatements } from "@/server/billing/generate";
import { removeLateFee, waivePenalty } from "@/server/billing/penalty";
import { RECENT_PERIOD_COUNT, recentPeriods } from "@/server/billing/period";
import { cancelStatement, markOverdue } from "@/server/billing/statements";
import { getDb } from "@/server/db/client";
import { runDailyJob } from "@/server/jobs/daily";
import { listSubscriptions } from "@/server/subscriptions/service";

export interface GenerateState {
  message?: string;
  error?: string;
}

const generateSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a billing month."),
  subscriptionId: z.string().optional(),
});

/** Issues any missing statements for a month. Idempotent: existing ones are never changed. */
export async function generateStatementsAction(_prev: GenerateState, formData: FormData): Promise<GenerateState> {
  const admin = await requireAdmin();
  const parsed = generateSchema.safeParse({
    period: formData.get("period"),
    subscriptionId: formData.get("subscriptionId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  // Only the months the form offers: the current one and the 11 before it (never the future).
  if (!recentPeriods(new Date(), RECENT_PERIOD_COUNT).includes(parsed.data.period)) {
    return { error: "Pick one of the listed months." };
  }

  const db = getDb();
  const { subscriptionId } = parsed.data;
  if (subscriptionId && !listSubscriptions(db).some((p) => p.id === subscriptionId && p.isActive)) {
    return { error: "That plan isn't active, so it has nothing to issue." };
  }

  let created: number;
  let existing: number;
  try {
    ({ created, existing } = generateStatements(db, { period: parsed.data.period, actorId: admin.id, subscriptionId }));
  } catch (error) {
    // The whole run is one transaction, so a failure leaves no half-issued month behind.
    console.error("Statement generation failed", error instanceof Error ? error.message : error);
    return { error: "Couldn't generate statements, and nothing was changed. Please try again." };
  }
  markOverdue(db);
  revalidatePath("/admin/statements");

  if (created === 0) return { message: "Nothing to create: every active member already has a statement for that month." };
  const kept = existing > 0 ? ` ${existing} already existed and were left unchanged.` : "";
  return { message: `Created ${created} ${created === 1 ? "statement" : "statements"}.${kept}` };
}

export interface CancelState {
  error?: string;
}

const CANCEL_ERRORS = {
  NOT_FOUND: "That statement no longer exists.",
  REASON_REQUIRED: "Add a short reason so there's a record of why.",
  REASON_TOO_LONG: "Keep the reason under 200 characters.",
  NOT_CANCELLABLE: "Only unpaid or overdue statements can be cancelled. Resolve any payment first.",
} as const;

export async function cancelStatementAction(_prev: CancelState, formData: FormData): Promise<CancelState> {
  const admin = await requireAdmin();
  const result = cancelStatement(getDb(), {
    statementId: String(formData.get("statementId") ?? ""),
    actorId: admin.id,
    reason: String(formData.get("reason") ?? ""),
  });
  if (!result.ok) return { error: CANCEL_ERRORS[result.error] };
  revalidatePath("/admin/statements");
  return {};
}

export interface PenaltyState {
  error?: string;
}

/** Excuses a late fee that is still building up, so it never lands on the next statement. */
export async function waivePenaltyAction(_prev: PenaltyState, formData: FormData): Promise<PenaltyState> {
  const admin = await requireAdmin();
  const result = waivePenalty(getDb(), { penaltyId: String(formData.get("penaltyId") ?? ""), actorId: admin.id });
  if (!result.ok) {
    return { error: result.error === "ALREADY_ON_STATEMENT" ? "That late fee is already on a statement. Remove it from the statement instead." : "That late fee no longer exists." };
  }
  revalidatePath("/admin/statements");
  return {};
}

/** Takes the late fees off an unpaid statement and excuses them. */
export async function removeLateFeeAction(_prev: PenaltyState, formData: FormData): Promise<PenaltyState> {
  const admin = await requireAdmin();
  const result = removeLateFee(getDb(), { statementId: String(formData.get("statementId") ?? ""), actorId: admin.id });
  if (!result.ok) {
    const errors = {
      NOT_FOUND: "That statement no longer exists.",
      NO_LATE_FEE: "There are no late fees on that statement.",
      NOT_EDITABLE: "A payment has already been reported for this statement, so its amount can't change. Resolve the payment first.",
    } as const;
    return { error: errors[result.error] };
  }
  revalidatePath("/admin/statements");
  return {};
}

export interface DailyRunState {
  message?: string;
  error?: string;
}

/** Runs the daily job now: issue what is due, mark overdue, queue reminders. Safe to repeat. */
export async function runDailyJobAction(): Promise<DailyRunState> {
  const admin = await requireAdmin();
  recordAudit(getDb(), { actorId: admin.id, action: "job.daily_run_started_by_hand", entityType: "job", entityId: "daily-reconcile" });
  const result = await runDailyJob("MANUAL");
  revalidatePath("/admin/statements");
  revalidatePath("/admin/notifications");
  if (!result.ran) return { error: "A run is already in progress. Try again in a minute." };
  if ("error" in result) return { error: `The run failed: ${result.error}` };
  const { created, markedOverdue, queued } = result.summary;
  return { message: `Done. Created ${created}, marked ${markedOverdue} overdue, queued ${queued} email${queued === 1 ? "" : "s"}.` };
}
