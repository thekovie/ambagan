import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { invitations, users } from "@/server/db/schema";
import { generateToken, hashToken } from "./tokens";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type InvitationRow = typeof invitations.$inferSelect;
type UserRow = typeof users.$inferSelect;

export type InvitationLookup =
  | { status: "valid"; invitation: InvitationRow; user: UserRow }
  | { status: "invalid" | "expired" | "used" | "inactive" };

interface CreateInput {
  userId: string;
  invitedBy: string | null;
  now?: Date;
}

/** Issues a fresh link and revokes any older pending invitation for the same member. */
export function createInvitation(db: Db, { userId, invitedBy, now = new Date() }: CreateInput) {
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  db.transaction((tx) => {
    tx.delete(invitations).where(and(eq(invitations.userId, userId), isNull(invitations.acceptedAt))).run();
    tx.insert(invitations).values({ userId, invitedBy, tokenHash: hashToken(token), expiresAt }).run();
  });
  return { token, expiresAt };
}

export function findInvitation(db: Db, token: string, now = new Date()): InvitationLookup {
  const row = db
    .select({ invitation: invitations, user: users })
    .from(invitations)
    .innerJoin(users, eq(users.id, invitations.userId))
    .where(eq(invitations.tokenHash, hashToken(token)))
    .get();
  if (!row) return { status: "invalid" };
  if (row.invitation.acceptedAt) return { status: "used" };
  if (row.invitation.expiresAt.getTime() < now.getTime()) return { status: "expired" };
  if (!row.user.isActive) return { status: "inactive" };
  return { status: "valid", invitation: row.invitation, user: row.user };
}

/** Marks the invitation used. The conditional update makes this safe under double submits. */
export function acceptInvitation(db: Db, token: string, now = new Date()): InvitationLookup {
  return db.transaction((tx) => {
    const found = findInvitation(tx as unknown as Db, token, now);
    if (found.status !== "valid") return found;
    const claimed = tx
      .update(invitations)
      .set({ acceptedAt: now })
      .where(and(eq(invitations.id, found.invitation.id), isNull(invitations.acceptedAt)))
      .returning()
      .get();
    return claimed ? { ...found, invitation: claimed } : { status: "used" };
  });
}
