"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/session";
import { generateStatements } from "@/server/billing/generate";
import { RECENT_PERIOD_COUNT, recentPeriods } from "@/server/billing/period";
import { cancelStatement, markOverdue } from "@/server/billing/statements";
import { getDb } from "@/server/db/client";
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
