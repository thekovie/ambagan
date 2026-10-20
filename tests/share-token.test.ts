import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createBill } from "@/server/bills";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { rotateShareLink, shareLinkPath, shareToken, verifyShareToken } from "@/server/share/token";
import { createTestDb } from "./helpers/db";

const SECRET = "a-test-secret-that-is-at-least-32-characters-long";
const OTHER_SECRET = "a-different-secret-that-is-also-32-characters!!";
const NOW = new Date("2026-10-05T04:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

let db: Db;
let admin: typeof s.users.$inferSelect;
let ana: typeof s.users.$inferSelect;
let tito: typeof s.users.$inferSelect;
let anaStatement: typeof s.statements.$inferSelect;
let titoStatement: typeof s.statements.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  admin = db.insert(s.users).values({ email: "admin@example.com", name: "Admin", role: "ADMIN" }).returning().get();
  ana = db.insert(s.users).values({ email: "ana@example.com", name: "Ana" }).returning().get();
  tito = db.insert(s.users).values({ email: "guest-tito@guests.invalid", name: "Tito", isGuest: true }).returning().get();
  const result = createBill(db, {
    billId: crypto.randomUUID(),
    title: "Dinner",
    dueDate: "2026-10-20",
    split: { v: 1, method: "EQUAL", totalMinor: 90000, participants: [admin.id, ana.id, tito.id] },
    actorId: admin.id,
    now: NOW,
  });
  if (!result.ok) throw new Error(JSON.stringify(result));
  anaStatement = result.statements.find((st) => st.userId === ana.id)!;
  titoStatement = result.statements.find((st) => st.userId === tito.id)!;
});

const verify = (token: string, now = NOW) => verifyShareToken(db, token, now, SECRET);
const token = (st = anaStatement) => shareToken(st, SECRET);

describe("share link tokens", () => {
  it("open exactly the statement they were made for, for members and guests alike", () => {
    const forAna = verify(token());
    expect(forAna.ok && forAna.statement.id).toBe(anaStatement.id);
    expect(forAna.ok && forAna.user.id).toBe(ana.id);
    const forTito = verify(token(titoStatement));
    expect(forTito.ok && forTito.user.id).toBe(tito.id);
  });

  it("look like statementId.version.signature and make a path under /s/", () => {
    expect(token()).toMatch(/^[0-9a-f-]{36}\.0\.[A-Za-z0-9_-]{43}$/);
    expect(shareLinkPath(anaStatement, SECRET)).toBe(`/s/${token()}`);
  });

  it("are different for every statement and every signing secret", () => {
    expect(token(anaStatement)).not.toBe(token(titoStatement));
    expect(shareToken(anaStatement, OTHER_SECRET)).not.toBe(token());
  });

  it("are refused when the signature was tampered with, or made with another secret", () => {
    const [id, version, tag] = token().split(".");
    const flipped = tag.slice(0, -1) + (tag.endsWith("A") ? "B" : "A");
    expect(verify(`${id}.${version}.${flipped}`)).toEqual({ ok: false });
    expect(verify(shareToken(anaStatement, OTHER_SECRET))).toEqual({ ok: false });
  });

  it("cannot be moved onto another statement, or onto another version", () => {
    const [anaId, , anaTag] = token().split(".");
    const [titoId] = token(titoStatement).split(".");
    expect(verify(`${titoId}.0.${anaTag}`)).toEqual({ ok: false });
    expect(verify(`${anaId}.1.${anaTag}`)).toEqual({ ok: false });
  });

  it("are refused when malformed, never throwing", () => {
    for (const bad of ["", "x", "a.b", "a.b.c.d", "..", `${anaStatement.id}.0.`, `${anaStatement.id}..abc`, `${anaStatement.id}.-1.${"A".repeat(43)}`, "😀".repeat(50), "A".repeat(5000), `${anaStatement.id}.0.${"A".repeat(43)}`]) {
      expect(verify(bad), bad.slice(0, 20)).toEqual({ ok: false });
    }
  });

  it("give no hint about why they failed", () => {
    expect(verify("nope")).toEqual({ ok: false });
    expect(verify(shareToken(anaStatement, OTHER_SECRET))).toEqual({ ok: false });
  });

  it("stop working when the link is replaced, and the new one works", () => {
    const old = token();
    expect(rotateShareLink(db, { statementId: anaStatement.id, actorId: admin.id })).toEqual({ ok: true, linkVersion: 1 });
    expect(verify(old)).toEqual({ ok: false });
    const fresh = db.select().from(s.statements).where(eq(s.statements.id, anaStatement.id)).get()!;
    expect(verify(shareToken(fresh, SECRET)).ok).toBe(true);
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "statement.link_replaced")).all()).toHaveLength(1);
  });

  it("can only be replaced by an active admin, for a bill statement that exists", () => {
    expect(rotateShareLink(db, { statementId: anaStatement.id, actorId: ana.id })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(rotateShareLink(db, { statementId: "missing", actorId: admin.id })).toEqual({ ok: false, error: "NOT_FOUND" });
    const spotify = db.insert(s.subscriptions).values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 100 }).returning().get();
    const monthly = db
      .insert(s.statements)
      .values({ reference: "SPOT-1", userId: ana.id, subscriptionId: spotify.id, period: "2026-10", subscriptionName: "Spotify", amountMinor: 1, outstandingMinor: 1, currency: "PHP", issuedAt: NOW, dueAt: NOW })
      .returning()
      .get();
    expect(rotateShareLink(db, { statementId: monthly.id, actorId: admin.id })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(verify(shareToken(monthly, SECRET))).toEqual({ ok: false }); // monthly statements have no share links
  });

  it("expire 90 days after the due date", () => {
    const due = anaStatement.dueAt.getTime();
    expect(verify(token(), new Date(due + 89 * DAY)).ok).toBe(true);
    expect(verify(token(), new Date(due + 91 * DAY))).toEqual({ ok: false });
  });

  it("still open a paid or cancelled statement (the page is read-only then), but not for someone who was deactivated", () => {
    db.update(s.statements).set({ status: "PAID", outstandingMinor: 0 }).where(eq(s.statements.id, anaStatement.id)).run();
    expect(verify(token()).ok).toBe(true);
    db.update(s.statements).set({ status: "CANCELLED" }).where(eq(s.statements.id, anaStatement.id)).run();
    expect(verify(token()).ok).toBe(true);
    db.update(s.users).set({ isActive: false }).where(eq(s.users.id, ana.id)).run();
    expect(verify(token())).toEqual({ ok: false });
  });

  it("refuse to sign anything with a weak secret", () => {
    expect(() => shareToken(anaStatement, "short")).toThrow(/secret/i);
  });
});
