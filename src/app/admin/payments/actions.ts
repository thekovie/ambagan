"use server";

import { revalidatePath } from "next/cache";
import { formatMinor } from "@/lib/money";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { approvePayment, declinePayment } from "@/server/payments/verify";

export interface ReviewState {
  error?: string;
}

const ERRORS = {
  FORBIDDEN: "Only an active administrator can do that.",
  NOT_FOUND: "That payment no longer exists.",
  NOT_PENDING: "That payment was already decided or its statement changed. Refresh to see the latest.",
  REASON_REQUIRED: "Add a short reason. The member will see it.",
  REASON_TOO_LONG: "Keep the reason under 300 characters.",
  ADJUSTMENT_TOO_SHORT: "Write a short note saying why you're accepting a different amount.",
  ADJUSTMENT_TOO_LONG: "Keep the adjustment note under 200 characters.",
} as const;

function refresh() {
  revalidatePath("/admin/payments");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/statements");
}

/** Confirms the money arrived. Re-authorises as an admin on every call. */
export async function approvePaymentAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const admin = await requireAdmin();
  const result = approvePayment(getDb(), {
    paymentId: String(formData.get("paymentId") ?? ""),
    adminId: admin.id,
    adjustmentNote: String(formData.get("adjustmentNote") ?? ""),
  });
  if (!result.ok) {
    if (result.error === "AMOUNT_MISMATCH") {
      return {
        error: `The member reported ${formatMinor(result.submittedMinor, result.currency)} but ${formatMinor(result.expectedMinor, result.currency)} is due. Add an adjustment note to accept it anyway.`,
      };
    }
    return { error: ERRORS[result.error] };
  }
  refresh();
  return {};
}

/** Rejects a report with a reason the member will see; the member can then report again. */
export async function declinePaymentAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const admin = await requireAdmin();
  const result = declinePayment(getDb(), {
    paymentId: String(formData.get("paymentId") ?? ""),
    adminId: admin.id,
    reason: String(formData.get("reason") ?? ""),
  });
  if (!result.ok) return { error: ERRORS[result.error] };
  refresh();
  return {};
}
