import "server-only";
import { getEnv } from "@/env";
import { getDb } from "@/server/db/client";
import { NOTIFICATION_TYPES, type NotificationPayload, type NotificationType } from "./notification-copy";
import { renderNotification } from "./notification-email";
import { processQueue, type DeliverOutcome, type ProcessResult, type QueuedEmail } from "./queue";
import { skipReason } from "./relevance";
import { sendMail } from "./transport";

const isNotification = (type: string): type is NotificationType => (NOTIFICATION_TYPES as readonly string[]).includes(type);

/** Renders a queued message and hands it to SMTP. Throws on failure so the queue can retry. */
async function deliver(email: QueuedEmail): Promise<DeliverOutcome> {
  // Checked at send time, not just when queued: it may have waited out an SMTP outage while the world moved on.
  const reason = skipReason(getDb(), email);
  if (reason) return { skip: reason };
  if (!isNotification(email.type)) throw new Error(`${email.type} mail is not sent from the queue`);
  const { html, text } = await renderNotification(email.type, JSON.parse(email.payload) as NotificationPayload, getEnv().APP_URL);
  await sendMail({ to: email.toEmail, subject: email.subject, html, text });
}

let running: Promise<ProcessResult> | undefined;

/**
 * Sends everything that is due. If a run is already in flight, wait for it and then do our own, so a message
 * queued while the first run was claiming is never skipped.
 */
export async function runEmailQueue(): Promise<ProcessResult> {
  while (running) await running.catch(() => undefined);
  running = processQueue(getDb(), deliver).finally(() => {
    running = undefined;
  });
  return running;
}

/** Fire and forget, for right after an action queued something. Failures are already recorded on the row. */
export function kickEmailQueue(): void {
  runEmailQueue().catch((error: unknown) => {
    console.error("Email queue run failed", error instanceof Error ? error.message : error);
  });
}
