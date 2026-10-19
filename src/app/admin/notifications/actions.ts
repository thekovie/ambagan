"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { emailLogs } from "@/server/db/schema";
import { queueTestEmail } from "@/server/email/notify";
import { releaseBackoff, resendEmail } from "@/server/email/queue";
import { runEmailQueue } from "@/server/email/worker";

export interface EmailActionState {
  message?: string;
  error?: string;
}

const RESEND_ERRORS = {
  NOT_FOUND: "That message no longer exists.",
  NOT_RESENDABLE: "Sign-in and invitation links can't be resent. Send a new invitation instead.",
  STILL_ACTIVE: "That message is still waiting to be sent.",
} as const;

/** Sends a test message to the admin's own address right now and reports what the mail server said. */
export async function sendTestEmailAction(): Promise<EmailActionState> {
  const admin = await requireAdmin();
  if (!admin.email) return { error: "Your account has no email address to send to." };
  const db = getDb();
  const id = queueTestEmail(db, { id: admin.id, email: admin.email, name: admin.name ?? null }, new Date());
  await runEmailQueue();
  revalidatePath("/admin/notifications");

  const row = db.select().from(emailLogs).where(eq(emailLogs.id, id)).get();
  if (row?.status === "SENT") return { message: `Sent to ${admin.email}. Check your inbox (and spam).` };
  return { error: row?.lastError ? `Not sent: ${row.lastError}` : "Not sent yet. It will be retried." };
}

/** Sends everything waiting now, including messages that were waiting out a retry delay. */
export async function sendQueuedNowAction(): Promise<EmailActionState> {
  await requireAdmin();
  releaseBackoff(getDb(), new Date());
  const result = await runEmailQueue();
  revalidatePath("/admin/notifications");
  if (result.sent + result.retrying + result.failed === 0) return { message: "Nothing was waiting." };
  return { message: `Sent ${result.sent}, will retry ${result.retrying}, gave up on ${result.failed}.` };
}

/** Queues a fresh copy of a sent or failed notification; the original stays as history. */
export async function resendEmailAction(_prev: EmailActionState, formData: FormData): Promise<EmailActionState> {
  const admin = await requireAdmin();
  const result = resendEmail(getDb(), String(formData.get("emailId") ?? ""), new Date(), admin.id);
  if (!result.ok) return { error: RESEND_ERRORS[result.error] };
  void runEmailQueue();
  revalidatePath("/admin/notifications");
  return { message: "Queued again." };
}
