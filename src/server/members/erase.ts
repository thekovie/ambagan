import { and, eq } from "drizzle-orm";
import { erasedEmail, isErasedEmail } from "@/lib/guest";
import { recordAudit } from "@/server/audit";
import { isActiveAdmin } from "@/server/bills/create";
import type { Db } from "@/server/db/client";
import { accounts, auditLogs, emailLogs, invitations, payments, sessions, users, verificationTokens } from "@/server/db/schema";

const asDb = (tx: unknown) => tx as Db;

export const ERASED_NAME = "Former member";

export type ErasePersonResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: "FORBIDDEN" | "NOT_FOUND" | "SELF" | "STILL_ACTIVE" };

/**
 * Removes what identifies a person, at their request (Data Privacy Act: erasure). Only for someone already
 * deactivated, so nobody is wiped by a stray click on a live account. Their name and email are replaced, every
 * sign-in leftover is deleted, and the free text and addresses we logged about them are cleared. Their statements
 * and payments stay, because the group needs them for its own accounts, but they no longer say who it was.
 * Safe to repeat.
 */
export function erasePersonalData(db: Db, input: { userId: string; actorId: string }): ErasePersonResult {
  if (!isActiveAdmin(db, input.actorId)) return { ok: false, error: "FORBIDDEN" };
  if (input.userId === input.actorId) return { ok: false, error: "SELF" };

  return db.transaction((tx): ErasePersonResult => {
    const t = asDb(tx);
    const person = t.select().from(users).where(eq(users.id, input.userId)).get();
    if (!person) return { ok: false, error: "NOT_FOUND" };
    if (person.isActive) return { ok: false, error: "STILL_ACTIVE" };
    if (isErasedEmail(person.email) && person.name === ERASED_NAME) return { ok: true, changed: false };

    const placeholder = erasedEmail(person.id);
    // Sign-in leftovers: a pending link for the old address, any session, any invitation, any linked account.
    t.delete(verificationTokens).where(eq(verificationTokens.identifier, person.email)).run();
    t.delete(sessions).where(eq(sessions.userId, person.id)).run();
    t.delete(invitations).where(eq(invitations.userId, person.id)).run();
    t.delete(accounts).where(eq(accounts.userId, person.id)).run();
    // Free text they typed, and the messages we logged to their address (including what was in them).
    t.update(payments).set({ notes: null }).where(eq(payments.userId, person.id)).run();
    t.update(emailLogs).set({ toEmail: placeholder, subject: "(removed)", payload: "{}", lastError: null }).where(eq(emailLogs.userId, person.id)).run();
    // The audit trail keeps what was done and when, but not the details about them (the address at the time they were added).
    t.update(auditLogs).set({ metadata: "{}" }).where(and(eq(auditLogs.entityType, "user"), eq(auditLogs.entityId, person.id))).run();
    t.update(users).set({ name: ERASED_NAME, email: placeholder, emailVerified: null, image: null }).where(eq(users.id, person.id)).run();

    // No personal details in this entry: only who asked for it, and for which account id.
    recordAudit(t, { actorId: input.actorId, action: "member.personal_data_removed", entityType: "user", entityId: person.id });
    return { ok: true, changed: true };
  });
}
