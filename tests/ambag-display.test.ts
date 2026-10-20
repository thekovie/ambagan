import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { stickerProps } from "@/lib/statement-view";
import { createBill } from "@/server/bills";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { copyFor, type NotificationPayload } from "@/server/email/notification-copy";
import { reconcile } from "@/server/jobs/reconcile";
import { createTestDb } from "./helpers/db";

const bill: NotificationPayload = {
  name: "Ana",
  subscription: "Dinner at Gerry's",
  period: "",
  isBill: "1",
  amount: "₱300.00",
  dueDate: "Tue, Oct 20",
  reference: "AMBAG-202610-K4M2Q8",
};
const monthly: NotificationPayload = { ...bill, subscription: "Spotify", period: "October 2026", isBill: undefined, amount: "₱75.50", reference: "SPOT-202610-K4M2Q8" };

describe("ambag emails read like an ambag", () => {
  it("announces the bill by its title, with no month", () => {
    const copy = copyFor("SOA_GENERATED", bill);
    expect(copy.subject).toBe("Your ambag for Dinner at Gerry's: ₱300.00");
    expect(copy.heading).toBe("Your ambag is ready");
    expect(copy.body[0]).toBe("Your share of Dinner at Gerry's is ₱300.00, due Tue, Oct 20.");
    expect(copy.facts).toEqual([
      ["Ambag", "Dinner at Gerry's"],
      ["Amount", "₱300.00"],
      ["Due", "Tue, Oct 20"],
      ["Statement", "AMBAG-202610-K4M2Q8"],
    ]);
  });

  it("words the reminders as 'your ambag for ...'", () => {
    expect(copyFor("DUE_TOMORROW", bill).body[0]).toBe("A friendly nudge: your ambag for Dinner at Gerry's (₱300.00) is due tomorrow, Tue, Oct 20.");
    expect(copyFor("DUE_TODAY", bill).body[0]).toBe("Your ambag for Dinner at Gerry's (₱300.00) is due today.");
    expect(copyFor("OVERDUE", bill).body[0]).toBe("Your ambag for Dinner at Gerry's (₱300.00) was due Tue, Oct 20.");
    expect(copyFor("DUE_TODAY", bill).subject).toBe("Due today: Dinner at Gerry's (₱300.00)");
  });

  it("leaves a monthly statement's wording exactly as it was", () => {
    expect(copyFor("SOA_GENERATED", monthly).subject).toBe("Your Spotify statement for October 2026: ₱75.50");
    expect(copyFor("DUE_TOMORROW", monthly).body[0]).toBe("A friendly nudge: your Spotify October 2026 share of ₱75.50 is due tomorrow, Tue, Oct 20.");
    expect(copyFor("OVERDUE", monthly).body[0]).toBe("Your Spotify October 2026 share of ₱75.50 was due Tue, Oct 20.");
    expect(copyFor("SOA_GENERATED", monthly).facts[0]).toEqual(["Plan", "Spotify"]);
  });
});

describe("ambag stickers", () => {
  const base = { reference: "AMBAG-1", period: "2026-10", status: "UNPAID" as const, subscriptionName: "Dinner at Gerry's", amountMinor: 30000, currency: "PHP", dueAt: new Date("2026-10-20T15:59:59Z"), cancelledAt: null };
  it("say Ambag where a monthly statement says its month", () => {
    const now = new Date("2026-10-05T00:00:00Z");
    expect(stickerProps({ ...base, billId: "b1" }, now).periodLabel).toBe("Ambag");
    expect(stickerProps({ ...base, billId: null }, now).periodLabel).toBe("October 2026");
    expect(stickerProps(base, now).periodLabel).toBe("October 2026");
  });
});

describe("the daily job and ambag statements", () => {
  let db: Db;
  const NOW = new Date("2026-10-05T04:00:00Z");

  beforeEach(() => {
    db = createTestDb();
  });

  function setup() {
    const admin = db.insert(s.users).values({ email: "admin@example.com", name: "Admin", role: "ADMIN" }).returning().get();
    const ana = db.insert(s.users).values({ email: "ana@example.com", name: "Ana" }).returning().get();
    const result = createBill(db, {
      billId: crypto.randomUUID(),
      title: "Dinner at Gerry's",
      dueDate: "2026-10-06", // due tomorrow, relative to Oct 5
      split: { v: 1, method: "EQUAL", totalMinor: 60000, participants: [admin.id, ana.id] },
      actorId: admin.id,
      now: NOW,
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    return { ana, statement: result.statements[0] };
  }

  it("does not send a second 'ready' email for a bill it did not create", () => {
    setup();
    expect(db.select().from(s.emailLogs).where(eq(s.emailLogs.type, "SOA_GENERATED")).all()).toHaveLength(1);
    reconcile(db, NOW);
    expect(db.select().from(s.emailLogs).where(eq(s.emailLogs.type, "SOA_GENERATED")).all()).toHaveLength(1);
  });

  it("reminds about a bill the day before it is due, in ambag words, and marks it overdue afterwards", () => {
    const { statement } = setup();
    reconcile(db, NOW);
    const reminder = db.select().from(s.emailLogs).where(eq(s.emailLogs.type, "DUE_TOMORROW")).get()!;
    expect(reminder.statementId).toBe(statement.id);
    expect(JSON.parse(reminder.payload)).toMatchObject({ isBill: "1", subscription: "Dinner at Gerry's" });

    reconcile(db, new Date("2026-10-07T04:00:00Z")); // the day after it was due
    expect(db.select().from(s.statements).where(eq(s.statements.id, statement.id)).get()!.status).toBe("OVERDUE");
    expect(db.select().from(s.emailLogs).where(eq(s.emailLogs.type, "OVERDUE")).all().length).toBeGreaterThan(0);
  });

  it("never generates a monthly statement for the hidden one-off plan", () => {
    setup();
    reconcile(db, NOW);
    reconcile(db, new Date("2026-11-03T04:00:00Z"));
    const plan = db.select().from(s.subscriptions).where(eq(s.subscriptions.kind, "ONE_OFF")).get()!;
    expect(db.select().from(s.statements).where(eq(s.statements.subscriptionId, plan.id)).all()).toHaveLength(1);
  });
});
