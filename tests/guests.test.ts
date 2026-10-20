import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { checkSignIn } from "@/server/auth/access";
import { acceptInvitation } from "@/server/auth/invitations";
import { createBill, listParticipants } from "@/server/bills";
import { listStatements } from "@/server/billing/statements";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { addGuest, promoteGuest } from "@/server/members/guests";
import { listMembers, resendInvitation } from "@/server/members/service";
import { createTestDb } from "./helpers/db";

let db: Db;
let admin: typeof s.users.$inferSelect;
let ana: typeof s.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  admin = db.insert(s.users).values({ email: "admin@example.com", name: "Admin", role: "ADMIN" }).returning().get();
  ana = db.insert(s.users).values({ email: "ana@example.com", name: "Ana" }).returning().get();
});

describe("addGuest", () => {
  it("adds a friend with just a name: a placeholder address, nobody to email", () => {
    const result = addGuest(db, { name: "  Tito   Boy ", actorId: admin.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user).toMatchObject({ name: "Tito Boy", isGuest: true, isActive: true, role: "MEMBER" });
    expect(result.user.email).toBe(`guest-${result.user.id}@guests.invalid`);
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "guest.added")).all()).toHaveLength(1);
  });

  it("keeps a real address when one is given (lowercased), so emails can reach them", () => {
    const result = addGuest(db, { name: "Tito", email: " Tito@Example.com ", actorId: admin.id });
    expect(result.ok && result.user.email).toBe("tito@example.com");
  });

  it("refuses an address that is already on the list", () => {
    expect(addGuest(db, { name: "Another Ana", email: "ANA@example.com", actorId: admin.id })).toEqual({ ok: false, error: "EMAIL_TAKEN" });
  });

  it("checks the name and the address, and who is asking", () => {
    expect(addGuest(db, { name: "   ", actorId: admin.id })).toEqual({ ok: false, error: "NAME_REQUIRED" });
    expect(addGuest(db, { name: "x".repeat(81), actorId: admin.id })).toEqual({ ok: false, error: "NAME_TOO_LONG" });
    expect(addGuest(db, { name: "Tito", email: "not-an-email", actorId: admin.id })).toEqual({ ok: false, error: "EMAIL_INVALID" });
    expect(addGuest(db, { name: "Tito", actorId: ana.id })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(db.select().from(s.users).all()).toHaveLength(2);
  });

  it("never lets a guest sign in, whatever address they have", () => {
    addGuest(db, { name: "Tito", email: "tito@example.com", actorId: admin.id });
    expect(checkSignIn(db, "tito@example.com", "boss@example.com")).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("promoteGuest (invite to join)", () => {
  const guestWith = (email?: string) => {
    const result = addGuest(db, { name: "Tito", email, actorId: admin.id });
    if (!result.ok) throw new Error(result.error);
    return result.user;
  };

  it("turns a guest with a real address into a member and issues an invitation that actually signs them in", () => {
    const guest = guestWith("tito@example.com");
    const result = promoteGuest(db, { userId: guest.id, actorId: admin.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(db.select().from(s.users).where(eq(s.users.id, guest.id)).get()).toMatchObject({ isGuest: false, email: "tito@example.com" });
    expect(acceptInvitation(db, result.invitation.token).status).toBe("valid");
    expect(checkSignIn(db, "tito@example.com", "boss@example.com")).toMatchObject({ ok: true });
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "guest.promoted")).all()).toHaveLength(1);
  });

  it("needs a real address for a guest who has only a placeholder, and keeps their history", () => {
    const guest = guestWith();
    expect(promoteGuest(db, { userId: guest.id, actorId: admin.id })).toEqual({ ok: false, error: "EMAIL_REQUIRED" });
    expect(promoteGuest(db, { userId: guest.id, email: "bad", actorId: admin.id })).toEqual({ ok: false, error: "EMAIL_INVALID" });
    expect(promoteGuest(db, { userId: guest.id, email: "ANA@example.com", actorId: admin.id })).toEqual({ ok: false, error: "EMAIL_TAKEN" });
    const done = promoteGuest(db, { userId: guest.id, email: "Tito@Example.com", actorId: admin.id });
    expect(done.ok && done.user.email).toBe("tito@example.com");
    expect(done.ok && done.user.id).toBe(guest.id); // same person, so their past ambag stay on their account
  });

  it("only works on guests, and only for an admin", () => {
    const guest = guestWith("tito@example.com");
    expect(promoteGuest(db, { userId: ana.id, actorId: admin.id })).toEqual({ ok: false, error: "NOT_A_GUEST" });
    expect(promoteGuest(db, { userId: "missing", actorId: admin.id })).toEqual({ ok: false, error: "NOT_A_GUEST" });
    expect(promoteGuest(db, { userId: guest.id, actorId: ana.id })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(db.select().from(s.users).where(eq(s.users.id, guest.id)).get()!.isGuest).toBe(true);
  });

  it("will not invite a guest who has been deactivated", () => {
    const guest = guestWith("tito@example.com");
    db.update(s.users).set({ isActive: false }).where(eq(s.users.id, guest.id)).run();
    expect(promoteGuest(db, { userId: guest.id, actorId: admin.id })).toEqual({ ok: false, error: "INACTIVE" });
    expect(db.select().from(s.users).where(eq(s.users.id, guest.id)).get()!.isGuest).toBe(true);
  });

  it("is the only way to invite a guest: a plain resend is refused until they are promoted", () => {
    const guest = guestWith("tito@example.com");
    expect(resendInvitation(db, { userId: guest.id, actorId: admin.id })).toEqual({ ok: false, error: "GUEST" });
  });
});

describe("who can be put in a bill", () => {
  it("lists active people with guests marked, and hides placeholder addresses", () => {
    const withEmail = addGuest(db, { name: "Tito", email: "tito@example.com", actorId: admin.id });
    const noEmail = addGuest(db, { name: "Boy", actorId: admin.id });
    const gone = db.insert(s.users).values({ email: "gone@example.com", name: "Gone", isActive: false }).returning().get();
    if (!withEmail.ok || !noEmail.ok) throw new Error("setup");

    const people = listParticipants(db);
    expect(people.map((p) => p.name)).toEqual(["Admin", "Ana", "Tito", "Boy"]); // members first, then guests
    expect(people.find((p) => p.id === gone.id)).toBeUndefined();
    expect(people.find((p) => p.name === "Admin")).toMatchObject({ isAdmin: true, isGuest: false, email: "admin@example.com" });
    expect(people.find((p) => p.name === "Boy")).toMatchObject({ isGuest: true, email: null });
    expect(people.find((p) => p.name === "Tito")).toMatchObject({ isGuest: true, email: "tito@example.com" });
  });

  it("never shows a placeholder address in the admin's statement or verification lists", () => {
    const guest = addGuest(db, { name: "Boy", actorId: admin.id });
    if (!guest.ok) throw new Error("setup");
    const bill = createBill(db, { billId: crypto.randomUUID(), title: "Dinner", dueDate: "2099-01-01", split: { v: 1, method: "EQUAL", totalMinor: 20000, participants: [admin.id, guest.user.id] }, actorId: admin.id });
    if (!bill.ok) throw new Error("setup");
    expect(listStatements(db, {}).find((r) => r.userId === guest.user.id)!.memberEmail).toBe("No email");
    expect(JSON.stringify(listStatements(db, {}))).not.toContain("guests.invalid");
  });

  it("marks guests on the members list too", () => {
    addGuest(db, { name: "Boy", actorId: admin.id });
    const rows = listMembers(db);
    expect(rows.find((r) => r.name === "Boy")).toMatchObject({ isGuest: true, hasRealEmail: false });
    expect(rows.find((r) => r.name === "Ana")).toMatchObject({ isGuest: false, hasRealEmail: true });
  });
});
