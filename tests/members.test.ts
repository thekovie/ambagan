import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { findInvitation } from "@/server/auth/invitations";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { updateOwnName } from "@/server/members/profile";
import { addMember, joinPlan, leavePlan, listMembers, listUninvited, resendInvitation, setMemberActive } from "@/server/members/service";
import { createTestDb } from "./helpers/db";

let db: Db;
let admin: typeof s.users.$inferSelect;
let spotify: typeof s.subscriptions.$inferSelect;
const NOW = new Date("2026-10-05T04:00:00Z"); // Oct 5, Manila

beforeEach(() => {
  db = createTestDb();
  admin = db.insert(s.users).values({ email: "boss@example.com", role: "ADMIN", name: "Boss" }).returning().get();
  spotify = db.insert(s.subscriptions).values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 5000 }).returning().get();
});

describe("addMember", () => {
  it("creates an active member, a membership starting this period, and a valid invitation", () => {
    const res = addMember(db, { name: "  Ana Reyes ", email: " Ana@Example.COM ", subscriptionId: spotify.id, invitedBy: admin.id, now: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.user).toMatchObject({ name: "Ana Reyes", email: "ana@example.com", role: "MEMBER", isActive: true });
    const membership = db.select().from(s.memberships).where(eq(s.memberships.userId, res.user.id)).get();
    expect(membership).toMatchObject({ subscriptionId: spotify.id, isActive: true, startPeriod: "2026-10" });
    expect(findInvitation(db, res.invitation.token, NOW).status).toBe("valid");
  });

  it("starts billing next month when the member joins after the plan's due day (no statement that is born overdue)", () => {
    const late = new Date("2026-10-20T04:00:00Z"); // past the 10th, Manila
    const res = addMember(db, { name: "Late Joiner", email: "late@example.com", subscriptionId: spotify.id, invitedBy: admin.id, now: late });
    if (!res.ok) throw new Error("setup");
    expect(db.select().from(s.memberships).where(eq(s.memberships.userId, res.user.id)).get()).toMatchObject({ startPeriod: "2026-11" });
  });

  it("stores a cleaned name: no line breaks or text-reordering characters", () => {
    const res = addMember(db, { name: "Ana\u202E\nReyes", email: "ana2@example.com", subscriptionId: null, invitedBy: admin.id, now: NOW });
    if (!res.ok) throw new Error("setup");
    expect(res.user.name).toBe("Ana Reyes");
  });

  it("records an audit entry", () => {
    const res = addMember(db, { name: "Ana", email: "ana@example.com", subscriptionId: null, invitedBy: admin.id, now: NOW });
    expect(res.ok).toBe(true);
    const log = db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "member.added")).get();
    expect(log).toMatchObject({ actorId: admin.id, entityType: "user" });
  });

  it("allows a member with no subscription yet", () => {
    const res = addMember(db, { name: "Ben", email: "ben@example.com", subscriptionId: null, invitedBy: admin.id, now: NOW });
    expect(res.ok).toBe(true);
    expect(db.select().from(s.memberships).all()).toHaveLength(0);
  });

  it("rejects a duplicate email (case-insensitive) without creating anything", () => {
    addMember(db, { name: "Ana", email: "ana@example.com", subscriptionId: null, invitedBy: admin.id, now: NOW });
    const dup = addMember(db, { name: "Other", email: "ANA@example.com", subscriptionId: null, invitedBy: admin.id, now: NOW });
    expect(dup).toEqual({ ok: false, error: "EMAIL_TAKEN" });
    expect(db.select().from(s.users).all()).toHaveLength(2);
  });

  it("rejects an unknown subscription and leaves no orphan user", () => {
    const res = addMember(db, { name: "Ana", email: "ana@example.com", subscriptionId: "nope", invitedBy: admin.id, now: NOW });
    expect(res).toEqual({ ok: false, error: "SUBSCRIPTION_NOT_FOUND" });
    expect(db.select().from(s.users).all()).toHaveLength(1);
  });

  it("rejects enrolment in an inactive plan (the page hides it, the server must too)", () => {
    db.update(s.subscriptions).set({ isActive: false }).where(eq(s.subscriptions.id, spotify.id)).run();
    const res = addMember(db, { name: "Ana", email: "ana@example.com", subscriptionId: spotify.id, invitedBy: admin.id, now: NOW });
    expect(res).toEqual({ ok: false, error: "SUBSCRIPTION_INACTIVE" });
    expect(db.select().from(s.users).all()).toHaveLength(1);
  });

  it("is all-or-nothing: a failure after the user insert rolls everything back", () => {
    // Make the invitation insert fail, after the user and the membership were already written.
    db.$client.exec("CREATE TRIGGER fail_invitation BEFORE INSERT ON invitation BEGIN SELECT RAISE(ABORT, 'boom'); END");
    expect(() =>
      addMember(db, { name: "Ana", email: "ana@example.com", subscriptionId: spotify.id, invitedBy: admin.id, now: NOW }),
    ).toThrow(/boom/);
    expect(db.select().from(s.users).all()).toHaveLength(1);
    expect(db.select().from(s.memberships).all()).toHaveLength(0);
    expect(db.select().from(s.invitations).all()).toHaveLength(0);
  });
});

describe("setMemberActive", () => {
  function member() {
    const res = addMember(db, { name: "Ana", email: "ana@example.com", subscriptionId: spotify.id, invitedBy: admin.id, now: NOW });
    if (!res.ok) throw new Error("setup failed");
    return res.user;
  }

  it("deactivation revokes sessions and stops billing the membership", () => {
    const ana = member();
    db.insert(s.sessions).values({ sessionToken: "t1", userId: ana.id, expires: new Date(NOW.getTime() + 1e6) }).run();
    expect(setMemberActive(db, { userId: ana.id, active: false, actorId: admin.id })).toEqual({ ok: true });
    expect(db.select().from(s.users).where(eq(s.users.id, ana.id)).get()?.isActive).toBe(false);
    expect(db.select().from(s.sessions).all()).toHaveLength(0);
    expect(db.select().from(s.memberships).get()?.isActive).toBe(false);
  });

  it("reactivation restores the account and membership", () => {
    const ana = member();
    setMemberActive(db, { userId: ana.id, active: false, actorId: admin.id });
    expect(setMemberActive(db, { userId: ana.id, active: true, actorId: admin.id })).toEqual({ ok: true });
    expect(db.select().from(s.users).where(eq(s.users.id, ana.id)).get()?.isActive).toBe(true);
    expect(db.select().from(s.memberships).get()?.isActive).toBe(true);
  });

  it("never lets an admin deactivate themselves", () => {
    expect(setMemberActive(db, { userId: admin.id, active: false, actorId: admin.id })).toEqual({ ok: false, error: "SELF" });
  });

  it("lets one admin deactivate another while a second admin stays active", () => {
    const other = db.insert(s.users).values({ email: "other@example.com", role: "ADMIN" }).returning().get();
    expect(setMemberActive(db, { userId: other.id, active: false, actorId: admin.id })).toEqual({ ok: true });
  });

  it("never removes the last active admin: nobody can deactivate themselves, and a stale admin record cannot act", () => {
    const stale = db.insert(s.users).values({ email: "stale@example.com", role: "ADMIN", isActive: false }).returning().get();
    expect(setMemberActive(db, { userId: admin.id, active: false, actorId: stale.id })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(setMemberActive(db, { userId: admin.id, active: false, actorId: admin.id })).toEqual({ ok: false, error: "SELF" });
    expect(db.select().from(s.users).where(eq(s.users.id, admin.id)).get()?.isActive).toBe(true);
  });

  it("on reactivation, billing resumes from the current period (paused months are not back-billed)", () => {
    const ana = member();
    setMemberActive(db, { userId: ana.id, active: false, actorId: admin.id });
    const later = new Date("2027-02-03T04:00:00Z"); // February in Manila
    setMemberActive(db, { userId: ana.id, active: true, actorId: admin.id, now: later });
    expect(db.select().from(s.memberships).get()).toMatchObject({ isActive: true, startPeriod: "2027-02" });
  });

  it("on reactivation after the due day, billing resumes next month", () => {
    const ana = member();
    setMemberActive(db, { userId: ana.id, active: false, actorId: admin.id });
    setMemberActive(db, { userId: ana.id, active: true, actorId: admin.id, now: new Date("2027-02-20T04:00:00Z") });
    expect(db.select().from(s.memberships).get()).toMatchObject({ startPeriod: "2027-03" });
  });

  it("reports unknown users", () => {
    expect(setMemberActive(db, { userId: "nope", active: false, actorId: admin.id })).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

describe("resendInvitation", () => {
  it("issues a fresh link and revokes the old one", () => {
    const first = addMember(db, { name: "Ana", email: "ana@example.com", subscriptionId: null, invitedBy: admin.id, now: NOW });
    if (!first.ok) throw new Error("setup");
    const res = resendInvitation(db, { userId: first.user.id, actorId: admin.id, now: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(findInvitation(db, first.invitation.token, NOW).status).toBe("invalid");
    expect(findInvitation(db, res.invitation.token, NOW).status).toBe("valid");
  });

  it("refuses deactivated members", () => {
    const first = addMember(db, { name: "Ana", email: "ana@example.com", subscriptionId: null, invitedBy: admin.id, now: NOW });
    if (!first.ok) throw new Error("setup");
    setMemberActive(db, { userId: first.user.id, active: false, actorId: admin.id });
    expect(resendInvitation(db, { userId: first.user.id, actorId: admin.id, now: NOW })).toEqual({ ok: false, error: "INACTIVE" });
  });
});

describe("updateOwnName", () => {
  it("trims, stores and audits the change", () => {
    expect(updateOwnName(db, { userId: admin.id, name: "  Boss Lady  " })).toEqual({ ok: true });
    expect(db.select().from(s.users).where(eq(s.users.id, admin.id)).get()?.name).toBe("Boss Lady");
    const log = db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "member.renamed")).get();
    expect(log).toMatchObject({ actorId: admin.id, entityId: admin.id });
  });

  it("rejects empty and over-long names and unknown users", () => {
    expect(updateOwnName(db, { userId: admin.id, name: "   " })).toEqual({ ok: false, error: "INVALID_NAME" });
    expect(updateOwnName(db, { userId: admin.id, name: "x".repeat(81) })).toEqual({ ok: false, error: "INVALID_NAME" });
    expect(updateOwnName(db, { userId: "nope", name: "Ana" })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.select().from(s.users).where(eq(s.users.id, admin.id)).get()?.name).toBe("Boss");
  });
});

describe("listMembers", () => {
  it("summarises plans and invitation state per member", () => {
    const ana = addMember(db, { name: "Ana", email: "ana@example.com", subscriptionId: spotify.id, invitedBy: admin.id, now: NOW });
    if (!ana.ok) throw new Error("setup");
    const rows = listMembers(db, NOW);
    const anaRow = rows.find((r) => r.email === "ana@example.com")!;
    expect(anaRow).toMatchObject({ isActive: true, plans: ["Spotify"], invite: "pending" });
    const bossRow = rows.find((r) => r.email === "boss@example.com")!;
    expect(bossRow.invite).toBe("none");
  });

  it("reports expired and accepted invitations", () => {
    const ana = addMember(db, { name: "Ana", email: "ana@example.com", subscriptionId: null, invitedBy: admin.id, now: NOW });
    const ben = addMember(db, { name: "Ben", email: "ben@example.com", subscriptionId: null, invitedBy: admin.id, now: NOW });
    if (!ana.ok || !ben.ok) throw new Error("setup");
    db.update(s.invitations).set({ acceptedAt: NOW }).where(eq(s.invitations.userId, ben.user.id)).run();
    const later = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);
    const rows = listMembers(db, later);
    expect(rows.find((r) => r.email === "ana@example.com")?.invite).toBe("expired");
    expect(rows.find((r) => r.email === "ben@example.com")?.invite).toBe("accepted");
  });
});

describe("listUninvited (who 'invite everyone' would email)", () => {
  const add = (email: string, over: Partial<typeof s.users.$inferInsert> = {}) => db.insert(s.users).values({ email, name: email, ...over }).returning().get();

  it("is active friends who have never been invited and never signed in, not the admin, guests or anyone already invited", () => {
    const fresh = add("fresh@example.com");
    add("signedin@example.com", { emailVerified: NOW });
    add("inactive@example.com", { isActive: false });
    add("guest@example.com", { isGuest: true });
    const invited = add("invited@example.com");
    resendInvitation(db, { userId: invited.id, actorId: admin.id, now: NOW });

    expect(listUninvited(db, NOW).map((m) => m.id)).toEqual([fresh.id]);
  });

  it("is empty when everyone has been dealt with", () => {
    expect(listUninvited(db, NOW)).toEqual([]);
  });
});

describe("member management is for admins, even if a caller forgets to check", () => {
  it("refuses to add, invite, deactivate or reactivate anyone for a plain member or a deactivated admin", () => {
    const friend = db.insert(s.users).values({ email: "friend@example.com", name: "Friend" }).returning().get();
    const target = db.insert(s.users).values({ email: "target@example.com", name: "Target" }).returning().get();
    const retired = db.insert(s.users).values({ email: "retired@example.com", name: "Retired", role: "ADMIN", isActive: false }).returning().get();

    for (const actor of [friend, retired]) {
      expect(addMember(db, { name: "New", email: "new@example.com", subscriptionId: spotify.id, invitedBy: actor.id, now: NOW })).toEqual({ ok: false, error: "FORBIDDEN" });
      expect(resendInvitation(db, { userId: target.id, actorId: actor.id, now: NOW })).toEqual({ ok: false, error: "FORBIDDEN" });
      expect(setMemberActive(db, { userId: target.id, active: false, actorId: actor.id, now: NOW })).toEqual({ ok: false, error: "FORBIDDEN" });
    }
    expect(db.select().from(s.users).where(eq(s.users.email, "new@example.com")).all()).toHaveLength(0);
    expect(db.select().from(s.users).where(eq(s.users.id, target.id)).get()?.isActive).toBe(true);
  });
});


describe("joinPlan and leavePlan (changing a plan after the friend was added)", () => {
  function friend(email = "ana@example.com") {
    const res = addMember(db, { name: "Ana", email, subscriptionId: null, invitedBy: admin.id, now: NOW });
    if (!res.ok) throw new Error("setup");
    return res.user;
  }
  const enrolments = (userId: string) => db.select().from(s.memberships).where(eq(s.memberships.userId, userId)).all();

  it("puts a friend who had no plan into one, billed from this month while the due day hasn't passed", () => {
    const ana = friend();
    expect(joinPlan(db, { userId: ana.id, subscriptionId: spotify.id, actorId: admin.id, now: NOW })).toEqual({ ok: true, changed: true });
    expect(enrolments(ana.id)).toMatchObject([{ subscriptionId: spotify.id, isActive: true, startPeriod: "2026-10" }]);
    expect(listMembers(db, NOW).find((m) => m.id === ana.id)).toMatchObject({ plans: ["Spotify"], planIds: [spotify.id] });
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "member.plan_joined")).all()).toHaveLength(1);
  });

  it("starts next month when the due day has already passed, so the first statement is not born overdue", () => {
    const ana = friend();
    joinPlan(db, { userId: ana.id, subscriptionId: spotify.id, actorId: admin.id, now: new Date("2026-10-20T04:00:00Z") });
    expect(enrolments(ana.id)[0].startPeriod).toBe("2026-11");
  });

  it("joining twice changes nothing the second time", () => {
    const ana = friend();
    joinPlan(db, { userId: ana.id, subscriptionId: spotify.id, actorId: admin.id, now: NOW });
    expect(joinPlan(db, { userId: ana.id, subscriptionId: spotify.id, actorId: admin.id, now: NOW })).toEqual({ ok: true, changed: false });
    expect(enrolments(ana.id)).toHaveLength(1);
  });

  it("refuses a plan that is switched off, a missing plan, the hidden ambag plan, a guest and a deactivated friend", () => {
    const ana = friend();
    const off = db.insert(s.subscriptions).values({ name: "Netflix", refPrefix: "NFLX", feeMinor: 100, isActive: false }).returning().get();
    const oneOff = db.insert(s.subscriptions).values({ name: "Ambag", refPrefix: "AMBG", feeMinor: 0, kind: "ONE_OFF" }).returning().get();
    const guest = db.insert(s.users).values({ email: "guest-1@guests.invalid", isGuest: true }).returning().get();
    const join = (userId: string, subscriptionId: string) => joinPlan(db, { userId, subscriptionId, actorId: admin.id, now: NOW });

    expect(join(ana.id, off.id)).toEqual({ ok: false, error: "PLAN_INACTIVE" });
    expect(join(ana.id, "nope")).toEqual({ ok: false, error: "PLAN_NOT_FOUND" });
    expect(join(ana.id, oneOff.id)).toEqual({ ok: false, error: "PLAN_NOT_FOUND" });
    expect(join(guest.id, spotify.id)).toEqual({ ok: false, error: "GUEST" });
    expect(join("nope", spotify.id)).toEqual({ ok: false, error: "NOT_FOUND" });
    setMemberActive(db, { userId: ana.id, active: false, actorId: admin.id, now: NOW });
    expect(join(ana.id, spotify.id)).toEqual({ ok: false, error: "INACTIVE" });
    expect(db.select().from(s.memberships).all()).toEqual([]);
  });

  it("only an active admin can change plans", () => {
    const ana = friend();
    const other = friend("ben@example.com");
    expect(joinPlan(db, { userId: ana.id, subscriptionId: spotify.id, actorId: other.id, now: NOW })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(leavePlan(db, { userId: ana.id, subscriptionId: spotify.id, actorId: other.id })).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("removing stops the plan but keeps statements already issued, and a later reactivation does not bring it back", () => {
    const ana = friend();
    joinPlan(db, { userId: ana.id, subscriptionId: spotify.id, actorId: admin.id, now: NOW });
    db.insert(s.statements)
      .values({ reference: "SPOT-202610-AAAAAA", userId: ana.id, subscriptionId: spotify.id, period: "2026-10", subscriptionName: "Spotify", amountMinor: 5000, outstandingMinor: 5000, currency: "PHP", issuedAt: NOW, dueAt: NOW })
      .run();

    expect(leavePlan(db, { userId: ana.id, subscriptionId: spotify.id, actorId: admin.id })).toEqual({ ok: true, changed: true });
    expect(enrolments(ana.id)).toEqual([]);
    expect(db.select().from(s.statements).all()).toHaveLength(1);
    expect(leavePlan(db, { userId: ana.id, subscriptionId: spotify.id, actorId: admin.id })).toEqual({ ok: true, changed: false });

    setMemberActive(db, { userId: ana.id, active: false, actorId: admin.id, now: NOW });
    setMemberActive(db, { userId: ana.id, active: true, actorId: admin.id, now: NOW });
    expect(enrolments(ana.id)).toEqual([]);
  });
});
