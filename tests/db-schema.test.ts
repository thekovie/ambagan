import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { migrateDb, openDb, type Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { createTestDb } from "./helpers/db";

let db: Db;

function seed() {
  const user = db.insert(s.users).values({ email: "a@example.com" }).returning().get();
  const sub = db
    .insert(s.subscriptions)
    .values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 5000 })
    .returning()
    .get();
  return { user, sub };
}

function statementValues(userId: string, subscriptionId: string, over: Partial<typeof s.statements.$inferInsert> = {}) {
  return {
    reference: "SPOT-202610-AAAAAA",
    userId,
    subscriptionId,
    period: "2026-10",
    subscriptionName: "Spotify",
    amountMinor: 5000,
    outstandingMinor: 5000,
    currency: "PHP",
    issuedAt: new Date("2026-10-01T00:00:00+08:00"),
    dueAt: new Date("2026-10-10T23:59:59+08:00"),
    ...over,
  };
}

beforeEach(() => {
  db = createTestDb();
});

describe("schema constraints", () => {
  it("rejects a second statement for the same member, subscription and period", () => {
    const { user, sub } = seed();
    db.insert(s.statements).values(statementValues(user.id, sub.id)).run();
    expect(() =>
      db.insert(s.statements).values(statementValues(user.id, sub.id, { reference: "SPOT-202610-BBBBBB" })).run(),
    ).toThrow(/UNIQUE/);
  });

  it("rejects duplicate statement references", () => {
    const { user, sub } = seed();
    const other = db.insert(s.users).values({ email: "b@example.com" }).returning().get();
    db.insert(s.statements).values(statementValues(user.id, sub.id)).run();
    expect(() => db.insert(s.statements).values(statementValues(other.id, sub.id)).run()).toThrow(/UNIQUE/);
  });

  it("enforces foreign keys", () => {
    const { sub } = seed();
    expect(() => db.insert(s.statements).values(statementValues("missing-user", sub.id)).run()).toThrow(/FOREIGN KEY/);
  });

  it("restricts deleting a member who has statements (history is preserved)", () => {
    const { user, sub } = seed();
    db.insert(s.statements).values(statementValues(user.id, sub.id)).run();
    expect(() => db.delete(s.users).where(eq(s.users.id, user.id)).run()).toThrow(/FOREIGN KEY/);
  });

  it("rejects duplicate email-log dedupe keys", () => {
    const row = { type: "SOA_GENERATED" as const, toEmail: "a@example.com", subject: "x", dedupeKey: "k1" };
    db.insert(s.emailLogs).values(row).run();
    expect(() => db.insert(s.emailLogs).values(row).run()).toThrow(/UNIQUE/);
  });

  it("applies defaults: UNPAID statements, PENDING payments, active MEMBER users", () => {
    const { user, sub } = seed();
    expect(user).toMatchObject({ role: "MEMBER", isActive: true });
    const st = db.insert(s.statements).values(statementValues(user.id, sub.id)).returning().get();
    expect(st.status).toBe("UNPAID");
  });
});

describe("openDb", () => {
  it("enables WAL and foreign keys on a file database", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ambagan-"));
    const file = path.join(dir, "nested", "test.db");
    const fileDb = openDb(file);
    migrateDb(fileDb);
    const mode = fileDb.$client.pragma("journal_mode", { simple: true });
    const fk = fileDb.$client.pragma("foreign_keys", { simple: true });
    fileDb.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
    expect(mode).toBe("wal");
    expect(fk).toBe(1);
  });
});
