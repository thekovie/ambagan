"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isPlaceholderEmail } from "@/lib/guest";
import type { SplitIssue } from "@/lib/split";
import { requireAdmin } from "@/server/auth/session";
import { cancelBill, createBill, type CreateBillResult } from "@/server/bills";
import { sendPaymentRequest } from "@/server/bills/request";
import { getDb } from "@/server/db/client";
import { kickEmailQueue } from "@/server/email/worker";
import { addGuest, setGuestEmail } from "@/server/members/guests";
import { rotateShareLink } from "@/server/share/token";

export interface CreateBillState {
  error?: string;
  /** Plain-language problems with the split itself, shown next to the amounts. */
  issues?: SplitIssue[];
}

const CREATE_ERRORS: Record<Exclude<Extract<CreateBillResult, { ok: false }>["error"], "SPLIT_INVALID">, string> = {
  FORBIDDEN: "Only an admin can create an ambag.",
  INVALID_BILL_ID: "Something went wrong with this form. Refresh the page and try again.",
  TITLE_REQUIRED: "Give the ambag a title, like “Dinner at Gerry's”.",
  TITLE_TOO_LONG: "Keep the title under 80 characters.",
  NOTE_TOO_LONG: "Keep the note under 500 characters.",
  INVALID_DUE_DATE: "Pick a due date.",
  DUE_IN_PAST: "The due date can't be in the past.",
  BILL_CANCELLED: "This ambag was cancelled. Start a new one instead.",
  UNKNOWN_PARTICIPANT: "Someone in the split is no longer on the list. Refresh the page and check who is in.",
  NOBODY_TO_COLLECT_FROM: "Add at least one friend (other than yourself) to collect from.",
};

/** Creates an ambag from the builder. The split arrives as JSON and is re-checked and recomputed on the server. */
export async function createBillAction(_prev: CreateBillState, formData: FormData): Promise<CreateBillState> {
  const admin = await requireAdmin();

  let split: unknown;
  try {
    split = JSON.parse(String(formData.get("split") ?? ""));
  } catch {
    return { error: "Something went wrong with the split. Refresh the page and try again." };
  }

  const result = createBill(getDb(), {
    billId: String(formData.get("billId") ?? ""),
    title: String(formData.get("title") ?? ""),
    note: String(formData.get("note") ?? ""),
    dueDate: String(formData.get("dueDate") ?? ""),
    split,
    actorId: admin.id,
  });
  if (!result.ok) {
    if (result.error === "SPLIT_INVALID") return { error: result.issues[0]?.message ?? "Check the split.", issues: result.issues };
    return { error: CREATE_ERRORS[result.error] };
  }

  kickEmailQueue();
  revalidatePath("/admin", "layout");
  redirect(`/admin/ambag/${result.bill.id}${result.created ? "?created=1" : ""}`);
}

export interface CancelBillState {
  error?: string;
}

const CANCEL_ERRORS = {
  FORBIDDEN: "Only an admin can cancel an ambag.",
  NOT_FOUND: "That ambag no longer exists.",
  REASON_REQUIRED: "Add a short reason (at least 3 characters).",
  REASON_TOO_LONG: "Keep the reason under 200 characters.",
  ALREADY_CANCELLED: "This ambag is already cancelled.",
} as const;

export async function cancelBillAction(_prev: CancelBillState, formData: FormData): Promise<CancelBillState> {
  const admin = await requireAdmin();
  const billId = String(formData.get("billId") ?? "");
  const result = cancelBill(getDb(), { billId, actorId: admin.id, reason: String(formData.get("reason") ?? "") });
  if (!result.ok) {
    if (result.error === "BLOCKED") {
      const n = result.blockedBy.length;
      return { error: `${n} ${n === 1 ? "person has" : "people have"} paid or reported paying. Deal with ${n === 1 ? "that payment" : "those payments"} first (Verify), then cancel.` };
    }
    return { error: CANCEL_ERRORS[result.error] };
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/ambag/${billId}`);
}

/** Replaces one person's private link: the old URL stops working at once. */
export async function replaceLinkAction(_prev: CancelBillState, formData: FormData): Promise<CancelBillState> {
  const admin = await requireAdmin();
  const billId = String(formData.get("billId") ?? "");
  const result = rotateShareLink(getDb(), { statementId: String(formData.get("statementId") ?? ""), actorId: admin.id });
  if (!result.ok) return { error: result.error === "FORBIDDEN" ? "Only an admin can replace a link." : "That share no longer exists." };
  revalidatePath(`/admin/ambag/${billId}`);
  return {};
}

export interface AddGuestState {
  error?: string;
  /** Which field the error is about, so it can be marked and read out with that field. */
  errorField?: "name" | "email";
  guest?: { id: string; name: string; email: string | null };
  /** Submitted fields, echoed back on error so React's post-action form reset doesn't wipe them. */
  values?: { name: string; email: string };
}

const GUEST_ERRORS = {
  FORBIDDEN: "Only an admin can add a friend.",
  NAME_REQUIRED: "Enter their name.",
  NAME_TOO_LONG: "Keep the name under 80 characters.",
  EMAIL_INVALID: "That doesn't look like an email address. Leave it empty if you don't have one.",
  EMAIL_TAKEN: "That email is already on the list. Pick them from the list instead.",
} as const;

/** "Add a friend without an account" from inside the builder: returns the new person so the form can select them. */
export async function addGuestInlineAction(_prev: AddGuestState, formData: FormData): Promise<AddGuestState> {
  const admin = await requireAdmin();
  const values = { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? "") };
  const result = addGuest(getDb(), { ...values, actorId: admin.id });
  if (!result.ok) {
    const errorField = result.error === "NAME_REQUIRED" || result.error === "NAME_TOO_LONG" ? "name" : result.error.startsWith("EMAIL") ? "email" : undefined;
    return { error: GUEST_ERRORS[result.error], errorField, values };
  }
  revalidatePath("/admin/members");
  return { guest: { id: result.user.id, name: result.user.name ?? "", email: isPlaceholderEmail(result.user.email) ? null : result.user.email } };
}

export interface RequestState {
  error?: string;
  /** What happened, in a sentence, for the admin to read. */
  message?: string;
}

const REQUEST_ERRORS = {
  FORBIDDEN: "Only an admin can send a payment request.",
  NOT_FOUND: "That share no longer exists.",
  NOT_OWED: "That share is already settled, so there is nothing to ask for.",
  NO_EMAIL: "They don't have an email yet. Add one, or copy their link instead.",
} as const;

/** Emails one person their share (and how to pay) right now, instead of waiting for the daily reminders. */
export async function sendRequestAction(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const admin = await requireAdmin();
  const result = sendPaymentRequest(getDb(), { statementId: String(formData.get("statementId") ?? ""), actorId: admin.id });
  if (!result.ok) return { error: REQUEST_ERRORS[result.error] };
  kickEmailQueue();
  return { message: `Emailed to ${result.email}.` };
}

/** Gives a guest an email (they stay a guest) and emails them their share straight away. */
export async function addGuestEmailAction(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const admin = await requireAdmin();
  const db = getDb();
  const saved = setGuestEmail(db, { userId: String(formData.get("userId") ?? ""), email: String(formData.get("email") ?? ""), actorId: admin.id });
  if (!saved.ok) {
    return { error: saved.error === "NOT_A_GUEST" ? "Only a friend without an account can be given an email this way." : saved.error === "FORBIDDEN" ? GUEST_ERRORS.FORBIDDEN : GUEST_ERRORS[saved.error] };
  }
  revalidatePath("/admin/members");
  revalidatePath(`/admin/ambag/${String(formData.get("billId") ?? "")}`);
  const sent = sendPaymentRequest(db, { statementId: String(formData.get("statementId") ?? ""), actorId: admin.id });
  if (!sent.ok) return { message: "Email saved." };
  kickEmailQueue();
  return { message: `Saved, and emailed to ${sent.email}.` };
}

