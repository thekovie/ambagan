import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { formatDate } from "@/lib/dates";
import { isPlaceholderEmail } from "@/lib/guest";
import { formatMinor } from "@/lib/money";
import { periodLabel } from "@/server/billing/period";
import type { Db } from "@/server/db/client";
import { users, type paymentMethods, type payments, type statements } from "@/server/db/schema";
import { copyFor, type NotificationPayload, type NotificationType } from "./notification-copy";
import { enqueueEmail } from "./queue";

type Payment = typeof payments.$inferSelect;
type Statement = typeof statements.$inferSelect;
type Recipient = { id: string; email: string; name: string | null; isGuest?: boolean };

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
): boolean {
  // A guest with no email of their own has a placeholder address: nobody to write to (the admin shares their link).
  if (isPlaceholderEmail(to.email)) return false;
  // The email is a side effect of a payment change that shares its transaction: nothing here may throw,
  // or a formatting bug would make a real payment impossible to approve. Skip the email and say so.
  try {
    const full: NotificationPayload = { name: to.name ?? "", ...payload() };
    return enqueueEmail(db, {
      type,
      toEmail: to.email,
      subject: copyFor(type, full).subject,
      payload: full as unknown as Record<string, string>,
      dedupeKey,
      userId: to.id,
      statementId,
      now,
    }).queued;
  } catch (error) {
    console.error(`Could not queue ${type} email`, error instanceof Error ? error.message : error);
    return false;
  }
}

/** Statement facts every payment email shows. `amountMinor` is the payment's, which may differ from the statement's. */
function statementPayload(statement: Statement, amountMinor: number) {
  return {
    subscription: statement.subscriptionName,
    // An ambag has a title, not a month: the copy drops the "Month" row and says "your ambag for ..." instead.
    period: statement.billId ? "" : periodLabel(statement.period),
    ...(statement.billId ? { isBill: "1" } : {}),
    amount: formatMinor(amountMinor, statement.currency),
    // Late fees carried from earlier months are named, so the total is never a surprise.
    ...(statement.penaltyMinor > 0 ? { penalty: formatMinor(statement.penaltyMinor, statement.currency) } : {}),
    dueDate: formatDate(statement.dueAt),
    reference: statement.reference,
  };
}

/**
 * Guests have no account to sign in to, so their emails link to their private page instead of the signed-in ones.
 * The queued message only says so (`shareLink`); the link itself is a credential and is made when the email is sent
 * (see share/email-link.ts), never stored in the queue.
 */
function linkFor(statement: Statement, recipient: Recipient, signedInPath: string): { path?: string; shareLink?: string } {
  return recipient.isGuest && statement.billId ? { shareLink: "1" } : { path: signedInPath };
}

const activeUser = (db: Db, id: string): Recipient | undefined =>
  db
    .select({ id: users.id, email: users.email, name: users.name, isGuest: users.isGuest })
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
  const member = db
    .select({ id: users.id, email: users.email, name: users.name, isGuest: users.isGuest })
    .from(users)
    .where(eq(users.id, payment.userId))
    .get();

  if (member) {
    queueFor(
      db,
      "PAYMENT_RECEIVED",
      member,
      () => ({ ...statementPayload(statement, payment.amountMinor), ...linkFor(statement, member, "/payments") }),
      `PAYMENT_RECEIVED:${payment.id}`,
      statement.id,
      now,
    );
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
    () => ({
      ...statementPayload(statement, payment.amountMinor),
      ...linkFor(statement, member, `${STATEMENTS_PATH}/${statement.id}`),
      ...(reason ? { reason } : {}),
    }),
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

/**
 * A statement notice from the daily job: new statement or a reminder. `dedupeKey` says which occurrence this is,
 * so running the job twice in a day never sends it twice. Deactivated members are skipped. Returns whether a new
 * message was queued.
 */
export function notifyStatementEvent(
  db: Db,
  args: { type: "SOA_GENERATED" | "DUE_TOMORROW" | "DUE_TODAY" | "OVERDUE"; statement: Statement; dedupeKey: string; now: Date },
): boolean {
  const { type, statement, dedupeKey, now } = args;
  const member = activeUser(db, statement.userId);
  if (!member) return false;
  return queueFor(
    db,
    type,
    member,
    () => ({ ...statementPayload(statement, statement.outstandingMinor), ...linkFor(statement, member, `${STATEMENTS_PATH}/${statement.id}`) }),
    dedupeKey,
    statement.id,
    now,
  );
}

/**
 * A member tried to report a reference that another member had already reported. The database refuses the second
 * report (first reporter wins), so the admins are told: otherwise whoever reports a receipt first, honestly or not,
 * would look like its owner. Once per pair, however often they retry.
 */
export function notifyDuplicateAttempt(
  db: Db,
  args: { existing: Payment; attemptedBy: string; statement: Statement; transactionRef: string; now: Date },
): void {
  const { existing, attemptedBy, statement, transactionRef, now } = args;
  const nameOf = (id: string) => {
    const user = db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, id)).get();
    return user?.name || user?.email || "A member";
  };
  const memberName = nameOf(attemptedBy);
  const otherMemberName = nameOf(existing.userId);
  for (const admin of activeAdmins(db)) {
    queueFor(
      db,
      "ADMIN_DUPLICATE_ATTEMPT",
      admin,
      () => ({
        ...statementPayload(statement, existing.amountMinor),
        memberName,
        otherMemberName,
        transactionRef,
        path: "/admin/payments",
      }),
      `ADMIN_DUPLICATE_ATTEMPT:${existing.id}:${attemptedBy}:${admin.id}`,
      statement.id,
      now,
    );
  }
}

/**
 * Where people send money changed. Everyone else is told what changed (never the new values), so a swapped account
 * number, from a hijacked admin session for instance, doesn't go unnoticed until someone's money is gone.
 */
export function notifyPaymentDetailsChanged(
  db: Db,
  args: { method: Pick<typeof paymentMethods.$inferSelect, "id" | "label">; changed: string[]; actorId: string; now: Date },
): void {
  const { method, changed, actorId, now } = args;
  const actor = db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, actorId)).get();
  const actorName = actor?.name || actor?.email || "an admin";
  const recipients = db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.isActive, true), ne(users.id, actorId)))
    .all();
  for (const person of recipients) {
    queueFor(
      db,
      "PAYMENT_DETAILS_CHANGED",
      person,
      () => ({ destination: method.label, changed: changed.join(" and "), actorName }),
      `PAYMENT_DETAILS_CHANGED:${method.id}:${now.getTime()}:${person.id}`,
      null,
      now,
    );
  }
}
