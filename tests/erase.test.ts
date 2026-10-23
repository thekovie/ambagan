import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { isErasedEmail } from "@/lib/guest";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { ERASED_NAME, erasePersonalData } from "@/server/members/erase";
import { addMember, listMembers, setMemberActive } from "@/server/members/service";
import { createTestDb } from "./helpers/db";

const NOW = new Date("2026-10-05T04:00:00Z");

let db: Db;
let admin: typeof s.users.$inferSelect;
let ana: typeof s.users.$inferSelect;
let statement: typeof s.statements.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  admin = db.insert(s.users).values({ email: "boss@example.com", role: "ADMIN", name: "Boss" }).returning().get();
  const plan = db.insert(s.subscriptions).values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 5000 }).returning().get();
  const added = addMember(db, { name: "Ana Reyes", email: "ana@example.com", subscriptionId: plan.id, invitedBy: admin.id, now: NOW });
  if (!added.ok) throw new Error("setup");
  ana = added.user;

  const method = db.insert(s.paymentMethods).values({ kind: "GCASH", label: "GCash", isActive: true }).returning().get();
  statement = db
    .insert(s.statements)
    .values({ reference: "SPOT-202610-AAAAAA", userId: ana.id, subscriptionId: plan.id, period: "2026-10", subscriptionName: "Spotify", amountMinor: 5000, outstandingMinor: 0, currency: "PHP", issuedAt: NOW, dueAt: NOW, status: "PAID" })
    .returning()
    .get();
  db.insert(s.payments)
    .values({ statementId: statement.id, userId: ana.id, destinationMethodId: method.id, sendingApp: "Maya", amountMinor: 5000, transactionRef: "R1", transactionRefNorm: "R1", transactionDate: NOW, notes: "from my sister's phone", status: "APPROVED", submittedAt: NOW })
    .run();
  db.insert(s.sessions).values({ sessionToken: "tok-ana", userId: ana.id, expires: new Date("2026-12-01") }).run();
  db.insert(s.verificationTokens).values({ identifier: "ana@example.com", token: "hash", expires: new Date("2026-12-01") }).run();
  db.insert(s.emailLogs).values({ type: "SOA_GENERATED", toEmail: "ana@example.com", userId: ana.id, subject: "Your Spotify statement", payload: '{"name":"Ana Reyes"}', dedupeKey: "k1" }).run();
});

const erase = (userId = ana.id, actorId = admin.id) => erasePersonalData(db, { userId, actorId });
const person = () => db.select().from(s.users).where(eq(s.users.id, ana.id)).get()!;

describe("erasePersonalData", () => {
  it("removes who they are, but keeps the group's records", () => {
    setMemberActive(db, { userId: ana.id, active: false, actorId: admin.id, now: NOW });
    expect(erase()).toEqual({ ok: true, changed: true });

    expect(person()).toMatchObject({ name: ERASED_NAME, isActive: false, emailVerified: null, image: null });
    expect(isErasedEmail(person().email)).toBe(true);
    expect(person().email).not.toContain("ana");

    // Sign-in leftovers are gone.
    expect(db.select().from(s.sessions).where(eq(s.sessions.userId, ana.id)).all()).toEqual([]);
    expect(db.select().from(s.invitations).where(eq(s.invitations.userId, ana.id)).all()).toEqual([]);
    expect(db.select().from(s.verificationTokens).where(eq(s.verificationTokens.identifier, "ana@example.com")).all()).toEqual([]);

    // What they typed and what we logged about them is cleared.
    expect(db.select().from(s.payments).get()!.notes).toBeNull();
    expect(db.select().from(s.emailLogs).get()).toMatchObject({ subject: "(removed)", payload: "{}" });
    expect(db.select().from(s.emailLogs).get()!.toEmail).not.toContain("ana@example.com");
    const added = db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "member.added"), eq(s.auditLogs.entityId, ana.id))).get()!;
    expect(added.metadata).toBe("{}");

    // The statement and the payment stay, still pointing at the same (now anonymous) person.
    expect(db.select().from(s.statements).get()).toMatchObject({ id: statement.id, userId: ana.id, amountMinor: 5000 });
    expect(db.select().from(s.payments).get()).toMatchObject({ userId: ana.id, amountMinor: 5000, transactionRef: "R1" });
  });

  it("records who did it without any personal details, and is safe to repeat", () => {
    setMemberActive(db, { userId: ana.id, active: false, actorId: admin.id, now: NOW });
    erase();
    expect(erase()).toEqual({ ok: true, changed: false });
    const logs = db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "member.personal_data_removed")).all();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actorId: admin.id, entityId: ana.id, metadata: "{}" });
  });

  it("only works on someone who has been deactivated, never yourself, and only for an admin", () => {
    expect(erase()).toEqual({ ok: false, error: "STILL_ACTIVE" });
    expect(person().name).toBe("Ana Reyes");
    expect(erase(admin.id, admin.id)).toEqual({ ok: false, error: "SELF" });
    expect(erase("nope")).toEqual({ ok: false, error: "NOT_FOUND" });
    setMemberActive(db, { userId: ana.id, active: false, actorId: admin.id, now: NOW });
    expect(erase(ana.id, ana.id)).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(person().name).toBe("Ana Reyes");
  });

  it("an erased person shows as a Former member and can't be reactivated", () => {
    setMemberActive(db, { userId: ana.id, active: false, actorId: admin.id, now: NOW });
    erase();
    expect(listMembers(db, NOW).find((m) => m.id === ana.id)).toMatchObject({ name: ERASED_NAME, isErased: true, hasRealEmail: false });
    expect(setMemberActive(db, { userId: ana.id, active: true, actorId: admin.id, now: NOW })).toEqual({ ok: false, error: "ERASED" });
    expect(person().isActive).toBe(false);
  });
});
