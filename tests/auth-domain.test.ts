import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { checkSignIn, normalizeEmail } from "@/server/auth/access";
import { acceptInvitation, createInvitation, findInvitation } from "@/server/auth/invitations";
import { createRateLimiter } from "@/server/auth/rate-limit";
import { canAccess } from "@/server/auth/roles";
import { generateToken, hashToken } from "@/server/auth/tokens";
import { createTestDb } from "./helpers/db";

let db: Db;
const ADMIN = "boss@example.com";
const NOW = new Date("2026-10-01T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function addUser(email: string, over: Partial<typeof s.users.$inferInsert> = {}) {
  return db.insert(s.users).values({ email, ...over }).returning().get();
}

beforeEach(() => {
  db = createTestDb();
});

describe("tokens", () => {
  it("generates long url-safe random tokens and hashes them deterministically", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Friend@Example.COM ")).toBe("friend@example.com");
  });
});

describe("checkSignIn (no self-signup)", () => {
  it("rejects unknown emails", () => {
    expect(checkSignIn(db, "stranger@example.com", ADMIN)).toEqual({ ok: false, reason: "unknown" });
  });

  it("accepts active invited members case-insensitively", () => {
    addUser("friend@example.com");
    const res = checkSignIn(db, "Friend@Example.com", ADMIN);
    expect(res.ok).toBe(true);
  });

  it("rejects deactivated members", () => {
    addUser("gone@example.com", { isActive: false });
    expect(checkSignIn(db, "gone@example.com", ADMIN)).toEqual({ ok: false, reason: "inactive" });
  });

  it("bootstraps the configured admin on first sign-in", () => {
    const res = checkSignIn(db, "BOSS@example.com", ADMIN);
    expect(res.ok && res.user.role).toBe("ADMIN");
    expect(db.select().from(s.users).where(eq(s.users.email, ADMIN)).all()).toHaveLength(1);
  });

  it("promotes an existing member whose email matches ADMIN_EMAIL, and never creates duplicates", () => {
    addUser(ADMIN, { role: "MEMBER" });
    const res = checkSignIn(db, ADMIN, ADMIN);
    expect(res.ok && res.user.role).toBe("ADMIN");
    expect(db.select().from(s.users).all()).toHaveLength(1);
  });

  it("does not let a deactivated ADMIN_EMAIL user back in", () => {
    addUser(ADMIN, { role: "ADMIN", isActive: false });
    expect(checkSignIn(db, ADMIN, ADMIN)).toEqual({ ok: false, reason: "inactive" });
  });
});

describe("invitations", () => {
  it("stores only a hash of the token", () => {
    const user = addUser("new@example.com");
    const { token } = createInvitation(db, { userId: user.id, invitedBy: null, now: NOW });
    const row = db.select().from(s.invitations).get()!;
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("is valid for 7 days, then expired", () => {
    const user = addUser("new@example.com");
    const { token } = createInvitation(db, { userId: user.id, invitedBy: null, now: NOW });
    expect(findInvitation(db, token, new Date(NOW.getTime() + 6 * DAY)).status).toBe("valid");
    expect(findInvitation(db, token, new Date(NOW.getTime() + 7 * DAY + 1)).status).toBe("expired");
  });

  it("reports unknown tokens as invalid without leaking details", () => {
    expect(findInvitation(db, "nope", NOW)).toEqual({ status: "invalid" });
  });

  it("can be accepted exactly once", () => {
    const user = addUser("new@example.com");
    const { token } = createInvitation(db, { userId: user.id, invitedBy: null, now: NOW });
    const first = acceptInvitation(db, token, NOW);
    expect(first.status).toBe("valid");
    expect(acceptInvitation(db, token, NOW).status).toBe("used");
  });

  it("a fresh invitation replaces older pending ones for the same member", () => {
    const user = addUser("new@example.com");
    const old = createInvitation(db, { userId: user.id, invitedBy: null, now: NOW });
    const fresh = createInvitation(db, { userId: user.id, invitedBy: null, now: NOW });
    expect(findInvitation(db, old.token, NOW).status).toBe("invalid");
    expect(findInvitation(db, fresh.token, NOW).status).toBe("valid");
  });

  it("refuses invitations for deactivated members", () => {
    const user = addUser("off@example.com", { isActive: false });
    const { token } = createInvitation(db, { userId: user.id, invitedBy: null, now: NOW });
    expect(findInvitation(db, token, NOW).status).toBe("inactive");
  });
});

describe("rate limiter", () => {
  it("allows up to the limit within a window, then blocks with retry info", () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 3, windowMs: 1000, now: () => t });
    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("a").allowed).toBe(true);
    const blocked = rl.hit("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(1000);
    expect(rl.hit("b").allowed).toBe(true);
    t = 1001;
    expect(rl.hit("a").allowed).toBe(true);
  });
});

describe("rate limiter memory bound", () => {
  it("never tracks more than maxKeys keys, evicting the oldest first", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2, now: () => 0 });
    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("b").allowed).toBe(true);
    expect(rl.hit("c").allowed).toBe(true); // evicts "a"
    expect(rl.size()).toBe(2);
    expect(rl.hit("b").allowed).toBe(false); // still tracked
    expect(rl.hit("a").allowed).toBe(true); // forgotten, starts a fresh window
  });
});

describe("canAccess", () => {
  it("enforces role and active status", () => {
    expect(canAccess({ role: "MEMBER", isActive: true }, "MEMBER")).toBe(true);
    expect(canAccess({ role: "MEMBER", isActive: true }, "ADMIN")).toBe(false);
    expect(canAccess({ role: "ADMIN", isActive: true }, "MEMBER")).toBe(true);
    expect(canAccess({ role: "ADMIN", isActive: false }, "ADMIN")).toBe(false);
    expect(canAccess(null, "MEMBER")).toBe(false);
  });
});
