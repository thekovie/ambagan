import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { formatDate } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { periodLabel } from "@/server/billing/period";
import type { Db } from "@/server/db/client";
import { users, type payments, type statements } from "@/server/db/schema";
import { copyFor, type NotificationPayload, type NotificationType } from "./notification-copy";
import { enqueueEmail } from "./queue";

type Payment = typeof payments.$inferSelect;
type Statement = typeof statements.$inferSelect;
type Recipient = { id: string; email: string; name: string | null };

const STATEMENTS_PATH = "/statements";

/** Writes the message into the queue. Call it inside the transaction that causes it, so both commit or neither does. */
function queueFor(
  db: Db,
  type: NotificationType,
  to: Recipient,
  payload: () => Omit<NotificationPayload, "name">,
  dedupeKey: string,
  statementId: string | null,
  now: Date,
): void {
  // The email is a side effect of a payment change that shares its transaction: nothing here may throw,
  // or a formatting bug would make a real payment impossible to approve. Skip the email and say so.
  try {
    const full: NotificationPayload = { name: to.name ?? "", ...payload() };
    enqueueEmail(db, {
      type,
      toEmail: to.email,
      subject: copyFor(type, full).subject,
      payload: full as unknown as Record<string, string>,
      dedupeKey,
      userId: to.id,
      statementId,
      now,
    });
  } catch (error) {
    console.error(`Could not queue ${type} email`, error instanceof Error ? error.message : error);
  }
}

/** Statement facts every payment email shows. `amountMinor` is the payment's, which may differ from the statement's. */
function statementPayload(statement: Statement, amountMinor: number) {
  return {
    subscription: statement.subscriptionName,
    period: periodLabel(statement.period),
    amount: formatMinor(amountMinor, statement.currency),
    dueDate: formatDate(statement.dueAt),
    reference: statement.reference,
  };
}

const activeUser = (db: Db, id: string): Recipient | undefined =>
  db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.id, id), eq(users.isActive, true)))
    .get();

const activeAdmins = (db: Db): Recipient[] =>
  db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)))
    .all();

/** A member reported a payment: confirm to them, and ask every active admin to verify it. */
export function notifyPaymentSubmitted(
  db: Db,
  args: { payment: Payment; statement: Statement; destinationLabel: string; now: Date },
): void {
  const { payment, statement, destinationLabel, now } = args;
  const member = db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, payment.userId)).get();

  if (member) {
    queueFor(db, "PAYMENT_RECEIVED", member, () => ({ ...statementPayload(statement, payment.amountMinor), path: "/payments" }), `PAYMENT_RECEIVED:${payment.id}`, statement.id, now);
  }
  for (const admin of activeAdmins(db)) {
    queueFor(
      db,
      "ADMIN_VERIFY_REQUEST",
      admin,
      () => ({
        ...statementPayload(statement, payment.amountMinor),
        memberName: member?.name || member?.email || "A member",
        destination: destinationLabel,
        transactionRef: payment.transactionRef,
        path: "/admin/payments",
      }),
      `ADMIN_VERIFY_REQUEST:${payment.id}:${admin.id}`,
      statement.id,
      now,
    );
  }
}

/** An admin decided a payment: tell the member (unless they have been deactivated). */
export function notifyPaymentDecided(
  db: Db,
  args: { type: "PAYMENT_APPROVED" | "PAYMENT_DECLINED"; payment: Payment; statement: Statement; reason?: string; now: Date },
): void {
  const { type, payment, statement, reason, now } = args;
  const member = activeUser(db, payment.userId);
  if (!member) return;
  queueFor(
    db,
    type,
    member,
    () => ({ ...statementPayload(statement, payment.amountMinor), path: `${STATEMENTS_PATH}/${statement.id}`, ...(reason ? { reason } : {}) }),
    `${type}:${payment.id}`,
    statement.id,
    now,
  );
}

/** "Send a test email" from the admin page. Each press is its own message, so it is never deduplicated away. */
export function queueTestEmail(db: Db, to: Recipient, now: Date): string {
  const payload: NotificationPayload = { name: to.name ?? "" };
  const queued = enqueueEmail(db, {
    type: "TEST",
    toEmail: to.email,
    subject: copyFor("TEST", payload).subject,
    payload: payload as unknown as Record<string, string>,
    dedupeKey: `TEST:${to.id}:${randomUUID()}`,
    userId: to.id,
    now,
  });
  if (!queued.queued) throw new Error("Test email was not queued");
  return queued.id;
}
