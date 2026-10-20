import { beforeEach, describe, expect, it } from "vitest";
import { createBill } from "@/server/bills";
import { createRateLimiter } from "@/server/auth/rate-limit";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { checkShareAccess } from "@/server/share/check";
import { shareToken, verifyShareToken } from "@/server/share/token";
import { createTestDb } from "./helpers/db";

const SECRET = "a-test-secret-that-is-at-least-32-characters-long";
const NOW = new Date("2026-10-05T04:00:00Z");

let db: Db;
let token: string;

beforeEach(() => {
  db = createTestDb();
  const admin = db.insert(s.users).values({ email: "admin@example.com", name: "Admin", role: "ADMIN" }).returning().get();
  const ana = db.insert(s.users).values({ email: "ana@example.com", name: "Ana" }).returning().get();
  const result = createBill(db, { billId: crypto.randomUUID(), title: "Dinner", dueDate: "2026-10-20", split: { v: 1, method: "EQUAL", totalMinor: 20000, participants: [admin.id, ana.id] }, actorId: admin.id, now: NOW });
  if (!result.ok) throw new Error(JSON.stringify(result));
  token = shareToken(result.statements[0], SECRET);
});

const limiter = () => createRateLimiter({ limit: 3, windowMs: 60_000, now: () => 0 });
const check = (limit: ReturnType<typeof limiter>, ip: string, t: string) => checkShareAccess(db, { token: t, ip, limiter: limit, now: NOW, secret: SECRET });

describe("private-link access and the failure limiter", () => {
  it("opens a valid link", () => {
    expect(check(limiter(), "1.1.1.1", token).ok).toBe(true);
  });

  it("answers every bad link the same way, and counts it against the caller's address only", () => {
    const l = limiter();
    for (const bad of ["nope", `${token.slice(0, -1)}x`, "a.b.c"]) expect(check(l, "9.9.9.9", bad)).toEqual({ ok: false, limited: false });
    expect(l.isLimited("9.9.9.9")).toBe(true);
    expect(l.isLimited("1.1.1.1")).toBe(false);
  });

  it("turns a noisy address's bad links away once it has used its allowance", () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) check(l, "9.9.9.9", "bad");
    expect(check(l, "9.9.9.9", "bad")).toEqual({ ok: false, limited: true });
  });

  it("NEVER blocks a valid link, even from an address that has used up its failures (shared and mobile addresses)", () => {
    const l = limiter();
    for (let i = 0; i < 10; i++) check(l, "9.9.9.9", "bad");
    expect(l.isLimited("9.9.9.9")).toBe(true);
    expect(check(l, "9.9.9.9", token).ok).toBe(true);
    expect(check(l, "unknown", token).ok).toBe(true);
  });

  it("does not count a valid link as an attempt", () => {
    const l = limiter();
    for (let i = 0; i < 20; i++) expect(check(l, "1.1.1.1", token).ok).toBe(true);
    expect(l.isLimited("1.1.1.1")).toBe(false);
  });
});

describe("tokens that are not what they seem", () => {
  it("accept only one spelling per link (no leading zeros in the version)", () => {
    const [id, version, tag] = token.split(".");
    expect(version).toBe("0");
    for (const alias of ["00", "000", "+0", " 0", "0 "]) expect(verifyShareToken(db, `${id}.${alias}.${tag}`, NOW, SECRET), alias).toEqual({ ok: false });
  });

  it("never throw on non-string input", () => {
    for (const weird of [undefined, null, 5, {}, [], ["a.b.c"]]) {
      expect(verifyShareToken(db, weird as unknown as string, NOW, SECRET)).toEqual({ ok: false });
    }
  });

  it("still work exactly at the end of the grace period and not a millisecond after", () => {
    const [id] = token.split(".");
    const statement = db.select().from(s.statements).all().find((st) => st.id === id)!;
    const end = statement.dueAt.getTime() + 90 * 24 * 60 * 60 * 1000;
    expect(verifyShareToken(db, token, new Date(end), SECRET).ok).toBe(true);
    expect(verifyShareToken(db, token, new Date(end + 1), SECRET)).toEqual({ ok: false });
  });
});
