import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gt, gte, inArray, lt, lte } from "drizzle-orm";
import type { EmailStatus, EmailType } from "@/lib/enums";
import { recordAudit } from "@/server/audit";
import type { Db } from "@/server/db/client";
import { emailLogs } from "@/server/db/schema";

export type QueuedEmail = typeof emailLogs.$inferSelect;

/** A message is tried this many times in total before it is marked FAILED. */
export const MAX_ATTEMPTS = 5;
/** Wait before retry after attempt 1, 2, 3, 4: 1 min, 5 min, 30 min, 2 h. */
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
/** How long a claimed message is "in flight". If the sender crashes, it becomes claimable again after this. */
export const LEASE_MS = 10 * 60_000;
const MAX_ERROR_LENGTH = 500;

/**
 * Sign-in and invitation mail is sent directly (the sender needs the outcome now, and the one-time link
 * is a secret that must not sit in the database). It is logged without the link and can't be resent.
 */
const DIRECT_TYPES: EmailType[] = ["LOGIN", "INVITATION"];

const asDb = (tx: unknown) => tx as Db;

interface EnqueueInput {
  type: EmailType;
  toEmail: string;
  subject: string;
  /** Pre-formatted strings the template needs; rendered at send time. */
  payload: Record<string, string>;
  /** Identifies the event, so a retry or a re-run can never queue it twice, e.g. "SOA_GENERATED:<statementId>". */
  dedupeKey: string;
  userId?: string | null;
  statementId?: string | null;
  now?: Date;
}

export type EnqueueResult = { queued: true; id: string } | { queued: false };

/** Adds a message to the queue. A repeated dedupe key is silently ignored. */
export function enqueueEmail(db: Db, input: EnqueueInput): EnqueueResult {
  const now = input.now ?? new Date();
  const row = db
    .insert(emailLogs)
    .values({
      type: input.type,
      toEmail: input.toEmail,
      subject: input.subject,
      payload: JSON.stringify(input.payload),
      dedupeKey: input.dedupeKey,
      userId: input.userId ?? null,
      statementId: input.statementId ?? null,
      nextAttemptAt: now,
      createdAt: now,
    })
    .onConflictDoNothing({ target: emailLogs.dedupeKey })
    .returning({ id: emailLogs.id })
    .get();
  return row ? { queued: true, id: row.id } : { queued: false };
}

/**
 * Takes up to `limit` due messages, oldest first, marking them SENDING with a lease. Messages left
 * SENDING by a crashed process come back after the lease expires. Immediate transaction: two
 * workers can never claim the same message.
 */
export function claimDueEmails(db: Db, now: Date, limit: number): QueuedEmail[] {
  return db.transaction((tx) => {
    const t = asDb(tx);
    // A message that was claimed MAX_ATTEMPTS times and never finished kept crashing its sender: stop retrying it.
    t.update(emailLogs)
      .set({ status: "FAILED", lastError: "The sender stopped before finishing" })
      .where(and(eq(emailLogs.status, "SENDING"), gte(emailLogs.attempts, MAX_ATTEMPTS), lte(emailLogs.nextAttemptAt, now)))
      .run();
    const due = t
      .select()
      .from(emailLogs)
      .where(and(inArray(emailLogs.status, ["PENDING", "SENDING"]), lte(emailLogs.nextAttemptAt, now)))
      .orderBy(asc(emailLogs.nextAttemptAt), asc(emailLogs.createdAt))
      .limit(limit)
      .all();
    return due.map((row) =>
      t
        .update(emailLogs)
        .set({ status: "SENDING", attempts: row.attempts + 1, nextAttemptAt: new Date(now.getTime() + LEASE_MS) })
        .where(eq(emailLogs.id, row.id))
        .returning()
        .get(),
    );
  }, { behavior: "immediate" });
}

/**
 * SENT means the SMTP server accepted the message. We never claim "delivered": SMTP gives no
 * delivery confirmation.
 */
export function markEmailSent(db: Db, id: string, now: Date): void {
  db.update(emailLogs).set({ status: "SENT", sentAt: now, lastError: null }).where(eq(emailLogs.id, id)).run();
}

/** Schedules a retry with backoff, or marks the message FAILED once attempts are used up. */
export function markEmailFailed(db: Db, id: string, error: string, now: Date): "retrying" | "failed" {
  const row = db.select().from(emailLogs).where(eq(emailLogs.id, id)).get();
  if (!row) return "failed";
  const lastError = error.slice(0, MAX_ERROR_LENGTH);

  if (row.attempts >= MAX_ATTEMPTS) {
    db.update(emailLogs).set({ status: "FAILED", lastError }).where(eq(emailLogs.id, id)).run();
    return "failed";
  }
  const wait = BACKOFF_MS[Math.min(row.attempts, BACKOFF_MS.length) - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
  db.update(emailLogs)
    .set({ status: "PENDING", lastError, nextAttemptAt: new Date(now.getTime() + wait) })
    .where(eq(emailLogs.id, id))
    .run();
  return "retrying";
}

/** Logs a directly sent message (sign-in, invitation) so the admin can see it. Never stores the link. */
export function recordDirectEmail(
  db: Db,
  input: { type: "LOGIN" | "INVITATION"; toEmail: string; subject: string; userId?: string | null; error?: string; now?: Date },
): void {
  const now = input.now ?? new Date();
  db.insert(emailLogs)
    .values({
      type: input.type,
      toEmail: input.toEmail,
      subject: input.subject,
      payload: "{}",
      dedupeKey: `${input.type}:${randomUUID()}`,
      userId: input.userId ?? null,
      status: input.error ? "FAILED" : "SENT",
      attempts: 1,
      lastError: input.error?.slice(0, MAX_ERROR_LENGTH) ?? null,
      sentAt: input.error ? null : now,
      nextAttemptAt: now,
      createdAt: now,
    })
    .run();
}

/** Admin "send now": messages waiting out a retry delay become due immediately. Returns how many. */
export function releaseBackoff(db: Db, now: Date): number {
  return db
    .update(emailLogs)
    .set({ nextAttemptAt: now })
    .where(and(eq(emailLogs.status, "PENDING"), gt(emailLogs.nextAttemptAt, now)))
    .run().changes;
}

/** Retention: finished messages hold addresses, subjects and decline reasons, so they are not kept forever. */
export function pruneEmails(db: Db, now: Date, olderThanDays: number): number {
  const cutoff = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000);
  return db
    .delete(emailLogs)
    .where(and(inArray(emailLogs.status, ["SENT", "FAILED"]), lt(emailLogs.createdAt, cutoff)))
    .run().changes;
}

export interface ProcessResult {
  sent: number;
  retrying: number;
  failed: number;
}

/**
 * Sends everything that is due through `deliver`. A failure is recorded and retried later; it
 * never stops the other messages and never touches billing or payment data.
 */
export async function processQueue(
  db: Db,
  deliver: (email: QueuedEmail) => Promise<void>,
  options: { now?: Date; limit?: number } = {},
): Promise<ProcessResult> {
  const clock = () => options.now ?? new Date();
  const result: ProcessResult = { sent: 0, retrying: 0, failed: 0 };

  for (const email of claimDueEmails(db, clock(), options.limit ?? 20)) {
    let failure: string | undefined;
    try {
      await deliver(email);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }

    // Recording the outcome is separate from sending: a database hiccup here must not turn a message the
    // server already accepted into a retry, nor stop the rest of the batch.
    try {
      if (failure === undefined) {
        markEmailSent(db, email.id, clock());
        result.sent += 1;
      } else {
        result[markEmailFailed(db, email.id, failure, clock()) === "failed" ? "failed" : "retrying"] += 1;
      }
    } catch (error) {
      console.error("Could not record an email result", error instanceof Error ? error.message : error);
    }
  }
  return result;
}

export type ResendResult =
  | { ok: true; id: string }
  | { ok: false; error: "NOT_FOUND" | "NOT_RESENDABLE" | "STILL_ACTIVE" };

/**
 * Admin action: queue a fresh copy of a finished (sent or failed) notification. The original stays
 * as history. Sign-in and invitation links can't be resent: the one-time link is gone, so send a new invitation.
 */
export function resendEmail(db: Db, id: string, now: Date, actorId?: string): ResendResult {
  const row = db.select().from(emailLogs).where(eq(emailLogs.id, id)).get();
  if (!row) return { ok: false, error: "NOT_FOUND" };
  if (DIRECT_TYPES.includes(row.type)) return { ok: false, error: "NOT_RESENDABLE" };
  if (row.status === "PENDING" || row.status === "SENDING") return { ok: false, error: "STILL_ACTIVE" };

  const queued = enqueueEmail(db, {
    type: row.type,
    toEmail: row.toEmail,
    subject: row.subject,
    payload: JSON.parse(row.payload) as Record<string, string>,
    dedupeKey: `${row.dedupeKey}#resend-${now.getTime()}`,
    userId: row.userId,
    statementId: row.statementId,
    now,
  });
  if (!queued.queued) return { ok: false, error: "STILL_ACTIVE" };
  if (actorId) recordAudit(db, { actorId, action: "email.resent", entityType: "email_log", entityId: row.id, metadata: { type: row.type } });
  return { ok: true, id: queued.id };
}

export function listEmails(db: Db, options: { status?: EmailStatus; limit: number }): QueuedEmail[] {
  return db
    .select()
    .from(emailLogs)
    .where(options.status ? eq(emailLogs.status, options.status) : undefined)
    .orderBy(desc(emailLogs.createdAt), desc(emailLogs.id))
    .limit(options.limit)
    .all();
}

export function emailCounts(db: Db): Record<EmailStatus, number> {
  const counts: Record<EmailStatus, number> = { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0 };
  for (const row of db.select({ status: emailLogs.status, n: count() }).from(emailLogs).groupBy(emailLogs.status).all()) {
    counts[row.status] = row.n;
  }
  return counts;
}
