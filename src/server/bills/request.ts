import { eq } from "drizzle-orm";
import { isPlaceholderEmail } from "@/lib/guest";
import { recordAudit } from "@/server/audit";
import type { Db } from "@/server/db/client";
import { statements, users } from "@/server/db/schema";
import { notifyStatementEvent } from "@/server/email/notify";
import { isActiveAdmin } from "./create";

/** Pressing the button twice in a moment sends one email; after this long it can be sent again as a nudge. */
const REQUEST_WINDOW_MS = 5 * 60 * 1000;

export type SendRequestResult =
  | { ok: true; email: string }
  | { ok: false; error: "FORBIDDEN" | "NOT_FOUND" | "NOT_OWED" | "NO_EMAIL" };

/**
 * Emails someone their share of an ambag now ("your ambag is ready", with how to pay), instead of waiting for the
 * daily reminders. A guest's email carries a flag and the private link is made when it is sent, never stored. Only
 * an unpaid share of a bill, and only for an admin; a friend with no email is refused (the admin copies their link).
 */
export function sendPaymentRequest(db: Db, input: { statementId: string; actorId: string; now?: Date }): SendRequestResult {
  if (!isActiveAdmin(db, input.actorId)) return { ok: false, error: "FORBIDDEN" };
  const now = input.now ?? new Date();

  return db.transaction((tx): SendRequestResult => {
    const t = tx as unknown as Db;
    const statement = t.select().from(statements).where(eq(statements.id, input.statementId)).get();
    if (!statement?.billId) return { ok: false, error: "NOT_FOUND" };
    if (statement.status !== "UNPAID" && statement.status !== "OVERDUE") return { ok: false, error: "NOT_OWED" };

    const person = t.select({ email: users.email, isActive: users.isActive }).from(users).where(eq(users.id, statement.userId)).get();
    if (!person?.isActive) return { ok: false, error: "NOT_FOUND" };
    if (isPlaceholderEmail(person.email)) return { ok: false, error: "NO_EMAIL" };

    notifyStatementEvent(t, {
      type: "SOA_GENERATED",
      statement,
      dedupeKey: `REQUEST:${statement.id}:${Math.floor(now.getTime() / REQUEST_WINDOW_MS)}`,
      now,
    });
    recordAudit(t, { actorId: input.actorId, action: "bill.request_sent", entityType: "statement", entityId: statement.id });
    return { ok: true, email: person.email };
  }, { behavior: "immediate" });
}
