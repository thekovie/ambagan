import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { statements, users } from "@/server/db/schema";
import type { QueuedEmail } from "./queue";

const REMINDERS = ["SOA_GENERATED", "DUE_TOMORROW", "DUE_TODAY", "OVERDUE"];
const DIRECT_OR_TEST = ["TEST", "LOGIN", "INVITATION"];

/**
 * Messages can wait in the queue for hours (an SMTP outage, a retry delay), and the world moves on meanwhile.
 * This is asked right before sending: it returns why the message is no longer worth sending, or null to send it.
 *
 * - The recipient has been deactivated since it was queued: never email them.
 * - A reminder whose statement has been paid, put under verification or cancelled since: don't nag.
 * - An admin's "please verify" whose payment has already been decided: don't send a stale request.
 * Confirmations and results (payment received/approved/declined) are not stale just because the statement moved on.
 */
export function skipReason(db: Db, email: QueuedEmail): string | null {
  if (DIRECT_OR_TEST.includes(email.type)) return null;

  if (email.userId) {
    const recipient = db.select({ isActive: users.isActive }).from(users).where(eq(users.id, email.userId)).get();
    if (recipient && !recipient.isActive) return "The recipient has been deactivated";
  }

  const needsStatement = REMINDERS.includes(email.type) || email.type === "ADMIN_VERIFY_REQUEST";
  if (needsStatement) {
    // email_log.statement_id is set to NULL if the statement were ever removed.
    const statement = email.statementId
      ? db.select({ status: statements.status }).from(statements).where(eq(statements.id, email.statementId)).get()
      : undefined;
    if (!statement) return "The statement no longer exists";
    if (REMINDERS.includes(email.type) && statement.status !== "UNPAID" && statement.status !== "OVERDUE") {
      return "The statement is no longer owed";
    }
    if (email.type === "ADMIN_VERIFY_REQUEST" && statement.status !== "UNDER_VERIFICATION") {
      return "That payment has already been decided";
    }
  }
  return null;
}
