import { and, asc, count, desc, eq, ne } from "drizzle-orm";
import { isPlaceholderEmail } from "@/lib/guest";
import { cleanDisplayName } from "@/lib/names";
import { recordAudit } from "@/server/audit";
import { normalizeEmail } from "@/server/auth/access";
import { createInvitation } from "@/server/auth/invitations";
import { isActiveAdmin } from "@/server/bills/create";
import { firstBillablePeriod } from "@/server/billing/period";
import type { Db } from "@/server/db/client";
import { invitations, memberships, sessions, subscriptions, users } from "@/server/db/schema";

type UserRow = typeof users.$inferSelect;
type Invitation = { token: string; expiresAt: Date };

// Drizzle transaction handles expose the same query API as the database.
const asDb = (tx: unknown) => tx as Db;

interface AddMemberInput {
  name: string;
  email: string;
  subscriptionId: string | null;
  invitedBy: string;
  now?: Date;
}

export type AddMemberResult =
  | { ok: true; user: UserRow; invitation: Invitation }
  | { ok: false; error: "FORBIDDEN" | "EMAIL_TAKEN" | "SUBSCRIPTION_NOT_FOUND" | "SUBSCRIPTION_INACTIVE" };

/** Creates the member, optionally enrols them in a plan, and issues their invitation, all or nothing. */
export function addMember(db: Db, input: AddMemberInput): AddMemberResult {
  // The action has already checked, but the rule lives here too so a forgotten check upstream cannot expose it.
  if (!isActiveAdmin(db, input.invitedBy)) return { ok: false, error: "FORBIDDEN" };
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email);

  return db.transaction((tx): AddMemberResult => {
    const t = asDb(tx);
    const subscription = input.subscriptionId
      ? t.select().from(subscriptions).where(eq(subscriptions.id, input.subscriptionId)).get()
      : null;
    if (input.subscriptionId && !subscription) return { ok: false, error: "SUBSCRIPTION_NOT_FOUND" };
    if (subscription && !subscription.isActive) return { ok: false, error: "SUBSCRIPTION_INACTIVE" };
    if (t.select({ id: users.id }).from(users).where(eq(users.email, email)).get()) {
      return { ok: false, error: "EMAIL_TAKEN" };
    }

    const user = t
      .insert(users)
      .values({ email, name: cleanDisplayName(input.name) || null })
      .returning()
      .get();
    if (subscription) {
      t.insert(memberships).values({ userId: user.id, subscriptionId: subscription.id, startPeriod: firstBillablePeriod(now, subscription.dueDay) }).run();
    }
    const invitation = createInvitation(t, { userId: user.id, invitedBy: input.invitedBy, now });
    recordAudit(t, {
      actorId: input.invitedBy,
      action: "member.added",
      entityType: "user",
      entityId: user.id,
      metadata: { email, subscriptionId: subscription?.id ?? null },
    });
    return { ok: true, user, invitation };
  });
}

export type SetActiveResult = { ok: true } | { ok: false; error: "FORBIDDEN" | "NOT_FOUND" | "SELF" | "LAST_ADMIN" };

/**
 * Deactivating revokes sessions immediately and pauses billing (memberships inactive).
 * Reactivating restores both and moves each membership's first billable period up to now,
 * so months spent paused are never billed retroactively. History is never deleted.
 */
export function setMemberActive(
  db: Db,
  input: { userId: string; active: boolean; actorId: string; now?: Date },
): SetActiveResult {
  const { userId, active, actorId, now = new Date() } = input;
  if (!isActiveAdmin(db, actorId)) return { ok: false, error: "FORBIDDEN" };

  return db.transaction((tx): SetActiveResult => {
    const t = asDb(tx);
    const target = t.select().from(users).where(eq(users.id, userId)).get();
    if (!target) return { ok: false, error: "NOT_FOUND" };

    if (!active) {
      if (userId === actorId) return { ok: false, error: "SELF" };
      if (target.role === "ADMIN" && target.isActive) {
        const others = t
          .select({ n: count() })
          .from(users)
          .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true), ne(users.id, userId)))
          .get();
        if (!others || others.n === 0) return { ok: false, error: "LAST_ADMIN" };
      }
    }

    t.update(users).set({ isActive: active }).where(eq(users.id, userId)).run();
    if (!active) t.delete(sessions).where(eq(sessions.userId, userId)).run();
    if (active) {
      // Billing resumes from the first month that isn't already late, never retroactively. "YYYY-MM" strings compare
      // correctly as text. Each plan has its own due day.
      const enrolments = t
        .select({ id: memberships.id, startPeriod: memberships.startPeriod, dueDay: subscriptions.dueDay })
        .from(memberships)
        .innerJoin(subscriptions, eq(subscriptions.id, memberships.subscriptionId))
        .where(eq(memberships.userId, userId))
        .all();
      for (const enrolment of enrolments) {
        const resume = firstBillablePeriod(now, enrolment.dueDay);
        t.update(memberships)
          .set({ isActive: true, startPeriod: enrolment.startPeriod > resume ? enrolment.startPeriod : resume })
          .where(eq(memberships.id, enrolment.id))
          .run();
      }
    } else {
      t.update(memberships).set({ isActive: false }).where(eq(memberships.userId, userId)).run();
    }
    recordAudit(t, {
      actorId,
      action: active ? "member.activated" : "member.deactivated",
      entityType: "user",
      entityId: userId,
    });
    return { ok: true };
  });
}

export type ResendResult =
  | { ok: true; user: UserRow; invitation: Invitation }
  | { ok: false; error: "FORBIDDEN" | "NOT_FOUND" | "INACTIVE" | "GUEST" };

export function resendInvitation(db: Db, input: { userId: string; actorId: string; now?: Date }): ResendResult {
  if (!isActiveAdmin(db, input.actorId)) return { ok: false, error: "FORBIDDEN" };
  return db.transaction((tx): ResendResult => {
    const t = asDb(tx);
    const user = t.select().from(users).where(eq(users.id, input.userId)).get();
    if (!user) return { ok: false, error: "NOT_FOUND" };
    if (!user.isActive) return { ok: false, error: "INACTIVE" };
    // A guest is refused at sign-in, so an invitation would be useless: "Invite to join" (promoteGuest) is the way.
    if (user.isGuest) return { ok: false, error: "GUEST" };
    const invitation = createInvitation(t, { userId: user.id, invitedBy: input.actorId, now: input.now });
    recordAudit(t, { actorId: input.actorId, action: "member.invitation_resent", entityType: "user", entityId: user.id });
    return { ok: true, user, invitation };
  });
}

export interface MemberRow {
  id: string;
  name: string | null;
  email: string;
  role: UserRow["role"];
  isActive: boolean;
  /** A friend with no account who pays through a private link. */
  isGuest: boolean;
  /** False for a guest with only a placeholder address (nobody to email). */
  hasRealEmail: boolean;
  hasSignedIn: boolean;
  plans: string[];
  invite: "none" | "pending" | "expired" | "accepted";
}

export function listMembers(db: Db, now = new Date()): MemberRow[] {
  const people = db.select().from(users).orderBy(asc(users.createdAt), asc(users.email)).all();

  const plansByUser = new Map<string, string[]>();
  const enrolments = db
    .select({ userId: memberships.userId, name: subscriptions.name })
    .from(memberships)
    .innerJoin(subscriptions, eq(subscriptions.id, memberships.subscriptionId))
    .where(eq(memberships.isActive, true))
    .all();
  for (const { userId, name } of enrolments) plansByUser.set(userId, [...(plansByUser.get(userId) ?? []), name]);

  // Newest invitation wins.
  const inviteByUser = new Map<string, MemberRow["invite"]>();
  for (const inv of db.select().from(invitations).orderBy(desc(invitations.createdAt)).all()) {
    if (inviteByUser.has(inv.userId)) continue;
    inviteByUser.set(inv.userId, inv.acceptedAt ? "accepted" : inv.expiresAt.getTime() < now.getTime() ? "expired" : "pending");
  }

  return people.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role,
    isActive: p.isActive,
    isGuest: p.isGuest,
    hasRealEmail: !isPlaceholderEmail(p.email),
    hasSignedIn: p.emailVerified !== null,
    plans: plansByUser.get(p.id) ?? [],
    invite: inviteByUser.get(p.id) ?? "none",
  }));
}

/** Friends an "invite everyone" would email: active, not a guest, never invited and never signed in. */
export function listUninvited(db: Db, now = new Date()): MemberRow[] {
  return listMembers(db, now).filter((m) => m.isActive && !m.isGuest && m.role !== "ADMIN" && !m.hasSignedIn && m.invite === "none");
}

