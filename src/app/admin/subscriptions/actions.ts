"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { parseSubscriptionForm, parseSubscriptionUpdateForm, type FormErrors } from "@/server/subscriptions/form";
import { createSubscription, updateSubscription } from "@/server/subscriptions/service";

export interface SubscriptionFormState {
  errors?: FormErrors;
  error?: string;
  saved?: boolean;
  /** Submitted strings, echoed back on error so React's post-action form reset doesn't wipe them. */
  values?: Record<string, string>;
}

/** Text fields only (the form has no file inputs). */
function textValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") values[key] = value;
  return values;
}

/** Create (no `id` field) or edit (hidden `id`) a plan. Re-authorises and re-validates on the server. */
export async function saveSubscriptionAction(
  _prev: SubscriptionFormState,
  formData: FormData,
): Promise<SubscriptionFormState> {
  const admin = await requireAdmin();
  const raw = textValues(formData);
  const id = raw.id || null;
  const db = getDb();

  if (id) {
    const parsed = parseSubscriptionUpdateForm(raw);
    if (!parsed.ok) return { errors: parsed.errors, values: raw };
    const result = updateSubscription(db, id, parsed.value, admin.id);
    if (!result.ok) return { error: "That plan no longer exists. Refresh and try again.", values: raw };
  } else {
    const parsed = parseSubscriptionForm(raw);
    if (!parsed.ok) return { errors: parsed.errors, values: raw };
    const result = createSubscription(db, parsed.value, admin.id);
    if (!result.ok) return { errors: { refPrefix: "That prefix is already used by another plan." }, values: raw };
  }

  revalidatePath("/admin/subscriptions");
  return { saved: true };
}
