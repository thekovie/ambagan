import { eq } from "drizzle-orm";
import { z } from "zod";
import { isPlaceholderEmail, placeholderEmail } from "@/lib/guest";
import { cleanDisplayName } from "@/lib/names";
import { recordAudit } from "@/server/audit";
import { normalizeEmail } from "@/server/auth/access";
import { createInvitation } from "@/server/auth/invitations";
import { isActiveAdmin } from "@/server/bills/create";
import type { Db } from "@/server/db/client";
import { users } from "@/server/db/schema";

type UserRow = typeof users.$inferSelect;

const asDb = (tx: unknown) => tx as Db;
const MAX_NAME_LENGTH = 80;
const emailSchema = z.email().max(254);

export type AddGuestResult =
  | { ok: true; user: UserRow }
  | { ok: false; error: "FORBIDDEN" | "NAME_REQUIRED" | "NAME_TOO_LONG" | "EMAIL_INVALID" | "EMAIL_TAKEN" };

/**
 * Adds a friend who has no account (a guest): a name, and optionally a real email so they get notifications. With no
 * email they get a placeholder address that can never receive mail (the admin shares their private link by chat).
 * Guests never sign in, but can be put in bills, pay through their link, and be promoted to a member later.
 */
export function addGuest(db: Db, input: { name: string; email?: string | null; actorId: string }): AddGuestResult {
  if (!isActiveAdmin(db, input.actorId)) return { ok: false, error: "FORBIDDEN" };
  const name = cleanDisplayName(input.name);
  if (!name) return { ok: false, error: "NAME_REQUIRED" };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: "NAME_TOO_LONG" };

  const given = input.email?.trim() ? normalizeEmail(input.email) : null;
  if (given && !emailSchema.safeParse(given).success) return { ok: false, error: "EMAIL_INVALID" };

  return db.transaction((tx): AddGuestResult => {
    const t = asDb(tx);
    if (given && t.select({ id: users.id }).from(users).where(eq(users.email, given)).get()) return { ok: false, error: "EMAIL_TAKEN" };

    const id = crypto.randomUUID();
    const user = t
      .insert(users)
      .values({ id, name, email: given ?? placeholderEmail(id), isGuest: true })
      .returning()
      .get();
    recordAudit(t, { actorId: input.actorId, action: "guest.added", entityType: "user", entityId: user.id, metadata: { hasEmail: Boolean(given) } });
    return { ok: true, user };
  }, { behavior: "immediate" });
}

export type PromoteGuestResult =
  | { ok: true; user: UserRow; invitation: { token: string; expiresAt: Date } }
  | { ok: false; error: "FORBIDDEN" | "NOT_A_GUEST" | "INACTIVE" | "EMAIL_REQUIRED" | "EMAIL_INVALID" | "EMAIL_TAKEN" };

/**
 * "Invite to join": turns a guest into a member and issues their invitation. The guest flag is cleared first, in the
 * same transaction, because a guest is refused at sign-in: an invitation for someone still marked as a guest could
 * never be accepted. It is the same person (same id), so everything they were billed for stays on their account.
 * A guest who only has a placeholder address needs a real one here.
 */
export function promoteGuest(db: Db, input: { userId: string; email?: string | null; actorId: string; now?: Date }): PromoteGuestResult {
  if (!isActiveAdmin(db, input.actorId)) return { ok: false, error: "FORBIDDEN" };

  return db.transaction((tx): PromoteGuestResult => {
    const t = asDb(tx);
    const guest = t.select().from(users).where(eq(users.id, input.userId)).get();
    if (!guest?.isGuest) return { ok: false, error: "NOT_A_GUEST" };
    if (!guest.isActive) return { ok: false, error: "INACTIVE" };

    let email = guest.email;
    if (isPlaceholderEmail(guest.email)) {
      if (!input.email?.trim()) return { ok: false, error: "EMAIL_REQUIRED" };
      email = normalizeEmail(input.email);
      if (!emailSchema.safeParse(email).success) return { ok: false, error: "EMAIL_INVALID" };
      if (t.select({ id: users.id }).from(users).where(eq(users.email, email)).get()) return { ok: false, error: "EMAIL_TAKEN" };
    }

    const user = t.update(users).set({ isGuest: false, email }).where(eq(users.id, guest.id)).returning().get();
    const invitation = createInvitation(t, { userId: user.id, invitedBy: input.actorId, now: input.now });
    recordAudit(t, { actorId: input.actorId, action: "guest.promoted", entityType: "user", entityId: user.id });
    return { ok: true, user, invitation };
  }, { behavior: "immediate" });
}
