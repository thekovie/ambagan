import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { dueDateOf, issueDateOf } from "@/server/billing/dates";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { enqueueEmail } from "@/server/email/queue";
import { skipReason } from "@/server/email/relevance";
import { createTestDb } from "./helpers/db";

let db: Db;
let ana: typeof s.users.$inferSelect;
let statement: typeof s.statements.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  ana = db.insert(s.users).values({ email: "ana@example.com", name: "Ana" }).returning().get();
  const plan = db.insert(s.subscriptions).values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 5000 }).returning().get();
  statement = db
    .insert(s.statements)
    .values({
      reference: "SPOT-202610-REL001",
      userId: ana.id,
      subscriptionId: plan.id,
      period: "2026-10",
      subscriptionName: "Spotify",
      amountMinor: 5000,
      outstandingMinor: 5000,
      currency: "PHP",
      issuedAt: issueDateOf("2026-10", 1),
      dueAt: dueDateOf("2026-10", 10),
    })
    .returning()
    .get();
});

function queued(type: (typeof s.emailLogs.$inferInsert)["type"], over: { userId?: string | null; statementId?: string | null } = {}) {
  const res = enqueueEmail(db, {
    type,
    toEmail: "ana@example.com",
    subject: "x",
    payload: {},
    dedupeKey: `${type}:${Math.random()}`,
    userId: over.userId === undefined ? ana.id : over.userId,
    statementId: over.statementId === undefined ? statement.id : over.statementId,
  });
  if (!res.queued) throw new Error("setup");
  return db.select().from(s.emailLogs).where(eq(s.emailLogs.id, res.id)).get()!;
}
const setStatus = (status: (typeof s.statements.$inferSelect)["status"]) =>
  db.update(s.statements).set({ status }).where(eq(s.statements.id, statement.id)).run();

describe("skipReason: reminders are re-checked when they are about to be sent", () => {
  it.each(["SOA_GENERATED", "DUE_TOMORROW", "DUE_TODAY", "OVERDUE"] as const)("%s goes out while the statement is still owed", (type) => {
    expect(skipReason(db, queued(type))).toBeNull();
    setStatus("OVERDUE");
    expect(skipReason(db, queued(type))).toBeNull();
  });

  it.each(["PAID", "UNDER_VERIFICATION", "CANCELLED"] as const)("a reminder for a statement that became %s is skipped", (status) => {
    const email = queued("DUE_TODAY");
    setStatus(status);
    expect(skipReason(db, email)).toMatch(/no longer owed/i);
  });

  it("a reminder for a member who has since been deactivated is skipped", () => {
    const email = queued("DUE_TODAY");
    db.update(s.users).set({ isActive: false }).where(eq(s.users.id, ana.id)).run();
    expect(skipReason(db, email)).toMatch(/deactivated/i);
  });

  it("a reminder whose statement no longer exists is skipped", () => {
    expect(skipReason(db, queued("DUE_TODAY", { statementId: null }))).toMatch(/no longer exists/i);
  });
});

describe("skipReason: other notifications", () => {
  it("an admin's verification request is skipped once the payment is no longer waiting", () => {
    setStatus("UNDER_VERIFICATION");
    const email = queued("ADMIN_VERIFY_REQUEST");
    expect(skipReason(db, email)).toBeNull();
    setStatus("PAID");
    expect(skipReason(db, email)).toMatch(/already been decided/i);
  });

  it.each(["PAYMENT_RECEIVED", "PAYMENT_APPROVED", "PAYMENT_DECLINED"] as const)("%s is still sent when the statement is paid (that is its whole point)", (type) => {
    setStatus("PAID");
    expect(skipReason(db, queued(type))).toBeNull();
  });

  it.each(["PAYMENT_RECEIVED", "PAYMENT_APPROVED", "PAYMENT_DECLINED"] as const)("%s is skipped for a deactivated member", (type) => {
    const email = queued(type);
    db.update(s.users).set({ isActive: false }).where(eq(s.users.id, ana.id)).run();
    expect(skipReason(db, email)).toMatch(/deactivated/i);
  });

  it("a test email is always sent", () => {
    expect(skipReason(db, queued("TEST", { statementId: null }))).toBeNull();
  });
});
