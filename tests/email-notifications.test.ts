import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { dueDateOf, issueDateOf } from "@/server/billing/dates";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { copyFor, NOTIFICATION_TYPES, type NotificationPayload } from "@/server/email/notification-copy";
import { notifyPaymentDecided, queueTestEmail } from "@/server/email/notify";
import { savePaymentMethod } from "@/server/payments/methods";
import { renderNotification } from "@/server/email/notification-email";
import { parsePaymentForm } from "@/server/payments/form";
import { submitPayment } from "@/server/payments/submit";
import { approvePayment, declinePayment } from "@/server/payments/verify";
import { createTestDb } from "./helpers/db";

const APP_URL = "https://ambagan.example.com";
const payload: NotificationPayload = {
  name: "Ana",
  subscription: "Spotify",
  period: "October 2026",
  amount: "₱75.50",
  dueDate: "Oct 10, 2026",
  reference: "SPOT-202610-K4M2Q8",
  path: "/statements/abc123",
  memberName: "Ana R. Reyes",
  destination: "GCash",
  transactionRef: "7034 512 840193",
  reason: "I can't see this transfer in my GCash",
  otherMemberName: "Ben Cruz",
  changed: "account number",
  actorName: "Boss",
};

describe("copyFor", () => {
  it("has copy for every notification type, each with a subject and a heading", () => {
    for (const type of NOTIFICATION_TYPES) {
      const copy = copyFor(type, payload);
      expect(copy.subject.length, type).toBeGreaterThan(5);
      expect(copy.heading.length, type).toBeGreaterThan(3);
      expect(copy.body.length, type).toBeGreaterThan(0);
    }
  });

  it.each([
    ["SOA_GENERATED", "Your Spotify statement for October 2026: ₱75.50"],
    ["DUE_TOMORROW", "Due tomorrow: Spotify October 2026 (₱75.50)"],
    ["DUE_TODAY", "Due today: Spotify October 2026 (₱75.50)"],
    ["OVERDUE", "Overdue: Spotify October 2026 (₱75.50)"],
    ["PAYMENT_RECEIVED", "We got your payment report for Spotify October 2026"],
    ["ADMIN_VERIFY_REQUEST", "Ana R. Reyes reported a payment of ₱75.50"],
    ["PAYMENT_APPROVED", "Payment confirmed: Spotify October 2026"],
    ["PAYMENT_DECLINED", "We couldn't confirm your Spotify October 2026 payment"],
    ["ADMIN_DUPLICATE_ATTEMPT", "Ana R. Reyes tried to report a reference already reported by Ben Cruz"],
    ["PAYMENT_DETAILS_CHANGED", "GCash payment details changed"],
    ["TEST", "ambagan test email"],
  ] as const)("%s subject", (type, subject) => {
    expect(copyFor(type, payload).subject).toBe(subject);
  });

  it("points each message at the page where the reader acts", () => {
    expect(copyFor("SOA_GENERATED", payload).cta?.path).toBe("/statements/abc123");
    expect(copyFor("PAYMENT_DECLINED", payload).cta?.path).toBe("/statements/abc123");
    expect(copyFor("ADMIN_VERIFY_REQUEST", payload).cta?.path).toBe("/admin/payments");
    expect(copyFor("PAYMENT_RECEIVED", payload).cta?.path).toBe("/payments");
    expect(copyFor("TEST", payload).cta).toBeUndefined();
  });

  it("includes the decline reason so the member knows what to fix", () => {
    expect(copyFor("PAYMENT_DECLINED", payload).body.join(" ")).toContain("I can't see this transfer in my GCash");
  });

  it("never says 'delivered' and tells the member the truth about what happens next", () => {
    const received = copyFor("PAYMENT_RECEIVED", payload).body.join(" ");
    expect(received).toMatch(/check/i);
    for (const type of NOTIFICATION_TYPES) expect(copyFor(type, payload).body.join(" ")).not.toMatch(/delivered/i);
  });
});

describe("renderNotification", () => {
  it.each(NOTIFICATION_TYPES)("renders %s as HTML and plain text", async (type) => {
    const { html, text } = await renderNotification(type, payload, APP_URL);
    expect(html).toContain("<!DOCTYPE html");
    expect(text.length).toBeGreaterThan(20);
    expect(text).not.toContain("<");
  });

  it("builds absolute links from APP_URL and the stored path", async () => {
    const { html, text } = await renderNotification("SOA_GENERATED", payload, APP_URL);
    expect(html).toContain(`href="${APP_URL}/statements/abc123"`);
    expect(text).toContain(`${APP_URL}/statements/abc123`);
  });

  it("escapes member-supplied text instead of injecting markup", async () => {
    const hostile = { ...payload, name: "<script>alert(1)</script>", reason: '"><img src=x onerror=alert(1)>' };
    const { html } = await renderNotification("PAYMENT_DECLINED", hostile, APP_URL);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("copes with a member who has no display name", async () => {
    const { text } = await renderNotification("SOA_GENERATED", { ...payload, name: "" }, APP_URL);
    expect(text).toContain("Hi there");
  });
});

// ---- Enqueue hooks: emails are written in the same transaction as the change that causes them ----

let db: Db;
let admin: typeof s.users.$inferSelect;
let ana: typeof s.users.$inferSelect;
let spotify: typeof s.subscriptions.$inferSelect;
let gcash: typeof s.paymentMethods.$inferSelect;
const NOW = new Date("2026-10-05T04:00:00Z");
let seq = 0;

function addStatement(userId: string, period = "2026-10") {
  seq += 1;
  return db
    .insert(s.statements)
    .values({
      reference: `SPOT-${period.replace("-", "")}-N${String(seq).padStart(5, "0")}`,
      userId,
      subscriptionId: spotify.id,
      period,
      subscriptionName: "Spotify",
      amountMinor: 7550,
      outstandingMinor: 7550,
      currency: "PHP",
      issuedAt: issueDateOf(period, 1),
      dueAt: dueDateOf(period, 10),
      status: "UNPAID",
    })
    .returning()
    .get();
}

function submit(userId: string, statementId: string, ref = `REF ${++seq} ABCDEF`) {
  const parsed = parsePaymentForm(
    { statementId, destinationMethodId: gcash.id, sendingApp: "Maya", amountPesos: "75.50", transactionRef: ref, transactionDate: "2026-10-04T16:25", notes: "" },
    NOW,
  );
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return submitPayment(db, { userId, input: parsed.value, now: NOW });
}

const emails = () => db.select().from(s.emailLogs).all();
const ofType = (type: string) => emails().filter((e) => e.type === type);

beforeEach(() => {
  db = createTestDb();
  admin = db.insert(s.users).values({ email: "boss@example.com", name: "Boss", role: "ADMIN" }).returning().get();
  ana = db.insert(s.users).values({ email: "ana@example.com", name: "Ana R. Reyes" }).returning().get();
  spotify = db.insert(s.subscriptions).values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 7550 }).returning().get();
  gcash = db.insert(s.paymentMethods).values({ kind: "GCASH", label: "GCash", accountName: "Kovie D.", accountNumber: "0917", isActive: true }).returning().get();
});

describe("submitting a payment queues emails", () => {
  it("confirms to the member and asks each active admin to verify", () => {
    db.insert(s.users).values({ email: "second@example.com", name: "Second", role: "ADMIN" }).run();
    db.insert(s.users).values({ email: "gone@example.com", name: "Gone", role: "ADMIN", isActive: false }).run();
    const st = addStatement(ana.id);
    const res = submit(ana.id, st.id);
    expect(res.ok).toBe(true);

    expect(ofType("PAYMENT_RECEIVED").map((e) => e.toEmail)).toEqual(["ana@example.com"]);
    expect(ofType("ADMIN_VERIFY_REQUEST").map((e) => e.toEmail).sort()).toEqual(["boss@example.com", "second@example.com"]);
    const verify = JSON.parse(ofType("ADMIN_VERIFY_REQUEST")[0].payload) as NotificationPayload;
    expect(verify).toMatchObject({ memberName: "Ana R. Reyes", amount: "₱75.50", destination: "GCash", path: "/admin/payments" });
    expect(ofType("PAYMENT_RECEIVED")[0]).toMatchObject({ userId: ana.id, statementId: st.id, status: "PENDING" });
  });

  it("queues nothing when the submission is refused (same transaction)", () => {
    const st = addStatement(ana.id);
    expect(submit(ana.id, st.id, "SAME 1111 2222").ok).toBe(true);
    const before = emails().length;
    const other = addStatement(ana.id, "2026-09");
    expect(submit(ana.id, other.id, "same-1111-2222")).toMatchObject({ ok: false, error: "DUPLICATE_REFERENCE" });
    expect(emails()).toHaveLength(before);
  });
});

describe("deciding a payment queues emails", () => {
  it("tells the member their payment was approved, once, even if the admin double-clicks", () => {
    const st = addStatement(ana.id);
    const res = submit(ana.id, st.id);
    if (!res.ok) throw new Error("setup");
    approvePayment(db, { paymentId: res.payment.id, adminId: admin.id, now: NOW });
    approvePayment(db, { paymentId: res.payment.id, adminId: admin.id, now: NOW });
    const sent = ofType("PAYMENT_APPROVED");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ toEmail: "ana@example.com", statementId: st.id });
    expect(JSON.parse(sent[0].payload)).toMatchObject({ amount: "₱75.50", period: "October 2026", subscription: "Spotify" });
  });

  it("tells the member why a payment was declined, and again if a resubmission is declined too", () => {
    const st = addStatement(ana.id);
    const first = submit(ana.id, st.id, "FIRST 1111 2222");
    if (!first.ok) throw new Error("setup");
    declinePayment(db, { paymentId: first.payment.id, adminId: admin.id, reason: "Not in my GCash", now: NOW });
    const second = submit(ana.id, st.id, "SECOND 3333 4444");
    if (!second.ok) throw new Error("setup");
    declinePayment(db, { paymentId: second.payment.id, adminId: admin.id, reason: "Still can't find it", now: NOW });
    const sent = ofType("PAYMENT_DECLINED");
    expect(sent).toHaveLength(2);
    expect(JSON.parse(sent[0].payload)).toMatchObject({ reason: "Not in my GCash", path: `/statements/${st.id}` });
  });

  it("queues nothing for a decision that was refused", () => {
    const st = addStatement(ana.id);
    const res = submit(ana.id, st.id);
    if (!res.ok) throw new Error("setup");
    const before = emails().length;
    expect(declinePayment(db, { paymentId: res.payment.id, adminId: ana.id, reason: "I am not an admin", now: NOW })).toMatchObject({ ok: false });
    expect(emails()).toHaveLength(before);
  });

  it("does not email a member who has been deactivated", () => {
    const st = addStatement(ana.id);
    const res = submit(ana.id, st.id);
    if (!res.ok) throw new Error("setup");
    db.update(s.users).set({ isActive: false }).where(eq(s.users.id, ana.id)).run();
    approvePayment(db, { paymentId: res.payment.id, adminId: admin.id, now: NOW });
    expect(ofType("PAYMENT_APPROVED")).toHaveLength(0);
  });
});

describe("notification code can never break the change that triggered it", () => {
  it("skips the email, and doesn't throw, when building it fails", () => {
    const st = addStatement(ana.id);
    const res = submit(ana.id, st.id);
    if (!res.ok) throw new Error("setup");
    const before = emails().length;
    const broken = { ...st, dueAt: new Date(Number.NaN) }; // formatting an invalid date throws
    expect(() => notifyPaymentDecided(db, { type: "PAYMENT_APPROVED", payment: res.payment, statement: broken, now: NOW })).not.toThrow();
    expect(emails()).toHaveLength(before);
  });
});

describe("queueTestEmail", () => {
  it("queues a test message to the admin, and every press is a new message", () => {
    const first = queueTestEmail(db, admin, NOW);
    const second = queueTestEmail(db, admin, NOW);
    expect(first).not.toBe(second);
    expect(ofType("TEST")).toHaveLength(2);
    expect(ofType("TEST")[0]).toMatchObject({ toEmail: "boss@example.com", subject: "ambagan test email", userId: admin.id, statementId: null });
  });
});

describe("someone reports a reference another member already reported", () => {
  it("tells the admins who tried and who reported it first, once per pair, and records it", () => {
    const ben = db.insert(s.users).values({ email: "ben@example.com", name: "Ben Cruz" }).returning().get();
    const first = submit(ben.id, addStatement(ben.id).id, "SHARED 1111 2222");
    expect(first.ok).toBe(true);
    const before = ofType("ADMIN_DUPLICATE_ATTEMPT").length;

    const attempt = submit(ana.id, addStatement(ana.id).id, "shared-1111-2222");
    expect(attempt).toMatchObject({ ok: false, error: "DUPLICATE_REFERENCE" });
    const alerts = ofType("ADMIN_DUPLICATE_ATTEMPT");
    expect(alerts).toHaveLength(before + 1);
    expect(alerts[0].toEmail).toBe("boss@example.com");
    expect(JSON.parse(alerts[0].payload)).toMatchObject({ memberName: "Ana R. Reyes", otherMemberName: "Ben Cruz", path: "/admin/payments" });
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "payment.duplicate_reference_blocked")).all()).toHaveLength(1);

    submit(ana.id, addStatement(ana.id, "2026-09").id, "SHARED 1111 2222"); // the same member tries again
    expect(ofType("ADMIN_DUPLICATE_ATTEMPT")).toHaveLength(before + 1);
  });

  it("stays quiet when a member trips over their own earlier report", () => {
    expect(submit(ana.id, addStatement(ana.id).id, "OWN 1111 2222").ok).toBe(true);
    submit(ana.id, addStatement(ana.id, "2026-09").id, "own 1111 2222");
    expect(ofType("ADMIN_DUPLICATE_ATTEMPT")).toHaveLength(0);
  });
});

describe("changing where people send money tells them", () => {
  const save = (over: Partial<Parameters<typeof savePaymentMethod>[2]>, actorId = admin.id) =>
    savePaymentMethod(db, gcash.id, { label: "GCash", accountName: "Kovie D.", accountNumber: "0917", instructions: "", isActive: true, ...over }, { kind: "keep" }, actorId);

  it("emails every other active member and admin when the account number changes, but not the person who changed it", () => {
    const second = db.insert(s.users).values({ email: "second@example.com", name: "Second", role: "ADMIN" }).returning().get();
    db.insert(s.users).values({ email: "gone@example.com", name: "Gone", isActive: false }).run();
    expect(save({ accountNumber: "0999 000 1111" }).ok).toBe(true);

    const sent = ofType("PAYMENT_DETAILS_CHANGED");
    expect(sent.map((e) => e.toEmail).sort()).toEqual(["ana@example.com", "second@example.com"]);
    expect(JSON.parse(sent[0].payload)).toMatchObject({ destination: "GCash", changed: "account number", actorName: "Boss" });
    void second;
  });

  it("does not put the new number in the email (it says what changed, not the details)", () => {
    save({ accountNumber: "0999 000 1111" });
    expect(ofType("PAYMENT_DETAILS_CHANGED").every((e) => !e.payload.includes("0999"))).toBe(true);
  });

  it("is quiet for changes that don't affect where money goes, and for a method that stays switched off", () => {
    save({ instructions: "Add your name in the notes" });
    expect(ofType("PAYMENT_DETAILS_CHANGED")).toHaveLength(0);
    db.update(s.paymentMethods).set({ isActive: false }).where(eq(s.paymentMethods.id, gcash.id)).run();
    save({ accountNumber: "0999 000 1111", isActive: false });
    expect(ofType("PAYMENT_DETAILS_CHANGED")).toHaveLength(0);
  });

  it("tells people when a method that was switched off is switched on", () => {
    db.update(s.paymentMethods).set({ isActive: false }).where(eq(s.paymentMethods.id, gcash.id)).run();
    save({ isActive: true });
    expect(ofType("PAYMENT_DETAILS_CHANGED")).toHaveLength(1);
  });
});
