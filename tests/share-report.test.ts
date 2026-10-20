import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBill } from "@/server/bills";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { parsePaymentForm } from "@/server/payments/form";
import { approvePayment, declinePayment } from "@/server/payments/verify";
import { getShareLinkView } from "@/server/share/view";
import { submitSharedPayment } from "@/server/share/report";
import { resolveShareLink } from "@/server/share/email-link";
import { rotateShareLink, shareToken, verifyShareToken } from "@/server/share/token";
import { createTestDb } from "./helpers/db";

const SECRET = "a-test-secret-that-is-at-least-32-characters-long";
const NOW = new Date("2026-10-05T04:00:00Z");

let db: Db;
let admin: typeof s.users.$inferSelect;
let ana: typeof s.users.$inferSelect;
let tito: typeof s.users.$inferSelect;
let anaStatement: typeof s.statements.$inferSelect;
let titoStatement: typeof s.statements.$inferSelect;
let gcash: typeof s.paymentMethods.$inferSelect;

let seq = 0;
beforeEach(() => {
  db = createTestDb();
  admin = db.insert(s.users).values({ email: "admin@example.com", name: "Admin", role: "ADMIN" }).returning().get();
  ana = db.insert(s.users).values({ email: "ana@example.com", name: "Ana" }).returning().get();
  tito = db.insert(s.users).values({ email: "guest-tito@guests.invalid", name: "Tito", isGuest: true }).returning().get();
  gcash = db.insert(s.paymentMethods).values({ kind: "GCASH", label: "GCash", accountName: "Admin", accountNumber: "0917", isActive: true }).returning().get();
  db.insert(s.paymentMethods).values({ kind: "MAYA", label: "Maya", accountName: "Admin", accountNumber: "0918", isActive: false }).run();
  const result = createBill(db, {
    billId: crypto.randomUUID(),
    title: "Dinner",
    note: "Thanks all!",
    dueDate: "2026-10-20",
    split: { v: 1, method: "EQUAL", totalMinor: 90000, participants: [admin.id, ana.id, tito.id] },
    actorId: admin.id,
    now: NOW,
  });
  if (!result.ok) throw new Error(JSON.stringify(result));
  anaStatement = result.statements.find((st) => st.userId === ana.id)!;
  titoStatement = result.statements.find((st) => st.userId === tito.id)!;
});

const link = (st: typeof s.statements.$inferSelect) => shareToken(st, SECRET);

function input(statementId: string, over: Record<string, unknown> = {}) {
  const parsed = parsePaymentForm({
    statementId,
    destinationMethodId: gcash.id,
    sendingApp: "Maya",
    amountPesos: "300.00",
    transactionRef: `REF ${++seq} ${Math.random().toString(36).slice(2, 8)}`,
    transactionDate: "2026-10-04T16:25",
    notes: "",
    ...over,
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.value;
}

const report = (token: string, statementId: string, over: Record<string, unknown> = {}) =>
  submitSharedPayment(db, { token, input: input(statementId, over), now: NOW, secret: SECRET });

describe("reporting a payment through a private link", () => {
  it("lets a guest with no account report a payment, which then waits for the admin", () => {
    const result = report(link(titoStatement), titoStatement.id);
    expect(result).toMatchObject({ ok: true, amountMatches: true });
    const payment = db.select().from(s.payments).get()!;
    expect(payment).toMatchObject({ statementId: titoStatement.id, userId: tito.id, status: "PENDING", amountMinor: 30000 });
    expect(db.select().from(s.statements).where(eq(s.statements.id, titoStatement.id)).get()!.status).toBe("UNDER_VERIFICATION");
    // The admin is asked to check it; the guest has no mailbox, so nobody else is emailed.
    const mails = db.select().from(s.emailLogs).all().filter((m) => m.type !== "SOA_GENERATED");
    expect(mails.map((m) => [m.type, m.toEmail])).toEqual([["ADMIN_VERIFY_REQUEST", "admin@example.com"]]);
  });

  it("always reports against the statement the link belongs to, whatever the form says", () => {
    // A guest trying to file a payment against someone else's statement.
    const result = report(link(titoStatement), anaStatement.id);
    expect(result.ok).toBe(true);
    expect(db.select().from(s.payments).where(eq(s.payments.statementId, anaStatement.id)).all()).toHaveLength(0);
    expect(db.select().from(s.payments).where(eq(s.payments.statementId, titoStatement.id)).all()).toHaveLength(1);
    expect(db.select().from(s.statements).where(eq(s.statements.id, anaStatement.id)).get()!.status).toBe("UNPAID");
  });

  it("refuses a bad, forged, replaced or expired link without saying which", () => {
    for (const token of ["nope", `${titoStatement.id}.0.${"A".repeat(43)}`, shareToken(titoStatement, "another-secret-that-is-32-characters-long!")]) {
      expect(report(token, titoStatement.id)).toEqual({ ok: false, error: "INVALID_LINK" });
    }
    const old = link(titoStatement);
    rotateShareLink(db, { statementId: titoStatement.id, actorId: admin.id });
    expect(report(old, titoStatement.id)).toEqual({ ok: false, error: "INVALID_LINK" });
    const expired = submitSharedPayment(db, { token: link(anaStatement), input: input(anaStatement.id), now: new Date("2027-03-01T00:00:00Z"), secret: SECRET });
    expect(expired).toEqual({ ok: false, error: "INVALID_LINK" });
    expect(db.select().from(s.payments).all()).toHaveLength(0);
  });

  it("applies every normal payment rule: not twice at once, not a reused reference, only active methods", () => {
    expect(report(link(titoStatement), titoStatement.id, { transactionRef: "SAME 1234 5678" }).ok).toBe(true);
    expect(report(link(titoStatement), titoStatement.id)).toEqual({ ok: false, error: "NOT_PAYABLE" });
    expect(report(link(anaStatement), anaStatement.id, { transactionRef: "same-1234-5678" })).toEqual({ ok: false, error: "DUPLICATE_REFERENCE" });
    const maya = db.select().from(s.paymentMethods).where(eq(s.paymentMethods.kind, "MAYA")).get()!;
    expect(report(link(anaStatement), anaStatement.id, { destinationMethodId: maya.id })).toEqual({ ok: false, error: "INVALID_DESTINATION" });
  });

  it("works through approval, and after a decline the guest can report again", () => {
    expect(report(link(titoStatement), titoStatement.id).ok).toBe(true);
    const payment = db.select().from(s.payments).get()!;
    declinePayment(db, { paymentId: payment.id, adminId: admin.id, reason: "Not found in GCash", now: NOW });
    expect(report(link(titoStatement), titoStatement.id).ok).toBe(true);
    const second = db.select().from(s.payments).where(eq(s.payments.status, "PENDING")).get()!;
    expect(approvePayment(db, { paymentId: second.id, adminId: admin.id, now: NOW }).ok).toBe(true);
    expect(db.select().from(s.statements).where(eq(s.statements.id, titoStatement.id)).get()!.status).toBe("PAID");
    // Once paid, the link is only a receipt.
    expect(report(link(titoStatement), titoStatement.id)).toEqual({ ok: false, error: "NOT_PAYABLE" });
  });
});

describe("emails to people who have no account", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("use the CURRENT link when sent, so replacing a link also fixes anything still queued or resent", () => {
    vi.stubEnv("AUTH_SECRET", SECRET);
    const guest = db.insert(s.users).values({ email: "tito@example.com", name: "Tito", isGuest: true }).returning().get();
    const result = createBill(db, { billId: crypto.randomUUID(), title: "Gift", dueDate: "2026-10-20", split: { v: 1, method: "EQUAL", totalMinor: 20000, participants: [admin.id, guest.id] }, actorId: admin.id, now: NOW });
    if (!result.ok) throw new Error(JSON.stringify(result));
    const statement = result.statements[0];
    const mail = db.select().from(s.emailLogs).where(eq(s.emailLogs.statementId, statement.id)).get()!;
    const payload = JSON.parse(mail.payload) as { path?: string; shareLink?: string };
    const before = resolveShareLink(db, payload, mail.statementId, SECRET).path;
    rotateShareLink(db, { statementId: statement.id, actorId: admin.id });
    const after = resolveShareLink(db, payload, mail.statementId, SECRET).path;
    expect(before).toMatch(/\.0\./);
    expect(after).toMatch(/\.1\./);
    expect(verifyShareToken(db, after!.slice(3), NOW, SECRET).ok).toBe(true);
    expect(verifyShareToken(db, before!.slice(3), NOW, SECRET).ok).toBe(false);
    // Payloads without the flag (everything for members) are untouched.
    expect(resolveShareLink(db, { path: "/statements/x" }, mail.statementId, SECRET)).toEqual({ path: "/statements/x" });
  });

  it("link a guest who has a real address to their private page, and members to the signed-in pages", () => {
    vi.stubEnv("AUTH_SECRET", SECRET);
    const guest = db.insert(s.users).values({ email: "tito@example.com", name: "Tito", isGuest: true }).returning().get();
    const result = createBill(db, {
      billId: crypto.randomUUID(),
      title: "Gift",
      dueDate: "2026-10-20",
      split: { v: 1, method: "EQUAL", totalMinor: 30000, participants: [admin.id, ana.id, guest.id] },
      actorId: admin.id,
      now: NOW,
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    const payloadOf = (mail: typeof s.emailLogs.$inferSelect) => JSON.parse(mail.payload) as { path?: string; shareLink?: string };
    // The queued row never holds the link (it is a credential); the link is made fresh when the email is sent.
    const pathOf = (mail: typeof s.emailLogs.$inferSelect) => {
      expect(mail.payload).not.toContain("/s/");
      expect(mail.payload).not.toContain(SECRET);
      return resolveShareLink(db, payloadOf(mail), mail.statementId, SECRET).path;
    };
    const mails = db.select().from(s.emailLogs).all().filter((m) => m.statementId && result.statements.some((st) => st.id === m.statementId));

    const guestStatement = result.statements.find((st) => st.userId === guest.id)!;
    const toGuest = mails.find((m) => m.toEmail === "tito@example.com")!;
    expect(pathOf(toGuest)).toBe(`/s/${shareToken(guestStatement, SECRET)}`);
    const anaStatementGift = result.statements.find((st) => st.userId === ana.id)!;
    expect(pathOf(mails.find((m) => m.toEmail === "ana@example.com")!)).toBe(`/statements/${anaStatementGift.id}`);

    // Their payment emails link the same way.
    const token = shareToken(guestStatement, SECRET);
    expect(submitSharedPayment(db, { token, input: input(guestStatement.id), now: NOW, secret: SECRET }).ok).toBe(true);
    const received = db.select().from(s.emailLogs).where(eq(s.emailLogs.type, "PAYMENT_RECEIVED")).all().find((m) => m.toEmail === "tito@example.com")!;
    expect(pathOf(received)).toBe(`/s/${token}`);
  });
});

describe("what a private link shows", () => {
  const view = (st: typeof s.statements.$inferSelect, now = NOW) => {
    const access = { statement: db.select().from(s.statements).where(eq(s.statements.id, st.id)).get()!, user: st.userId === ana.id ? ana : tito };
    return getShareLinkView(db, access, now);
  };

  it("is only this person's share: the bill, the total, their own lines, and how to pay", () => {
    const v = view(titoStatement);
    expect(v.share).toMatchObject({ title: "Dinner", note: "Thanks all!", totalMinor: 90000, amountMinor: 30000, method: "EQUAL", participantCount: 3 });
    expect(v.share.lines).toEqual([{ kind: "BASE", label: "Your share", amountMinor: 30000, note: "Split equally between 3" }]);
    expect(v.payable).toBe(true);
    expect(v.status).toBe("UNPAID");
    expect(v.methods.map((m) => m.label)).toEqual(["GCash"]); // only methods that are switched on
    expect(v.latestPayment).toBeNull();
    const json = JSON.stringify(v);
    for (const other of [ana.id, admin.id, "ana@example.com", "admin@example.com"]) expect(json).not.toContain(other);
  });

  it("shows the payment's progress, including why it was declined", () => {
    report(link(titoStatement), titoStatement.id, { transactionRef: "TITO 1111 2222" });
    expect(view(titoStatement)).toMatchObject({ payable: false, status: "UNDER_VERIFICATION", latestPayment: { status: "PENDING", declineReason: null } });
    const payment = db.select().from(s.payments).get()!;
    declinePayment(db, { paymentId: payment.id, adminId: admin.id, reason: "Not found in GCash", now: NOW });
    expect(view(titoStatement)).toMatchObject({ payable: true, status: "UNPAID", latestPayment: { status: "DECLINED", declineReason: "Not found in GCash" } });
  });

  it("reads as overdue once the due day has ended, and as read-only when cancelled", () => {
    expect(view(anaStatement, new Date("2026-10-21T04:00:00Z")).status).toBe("OVERDUE");
    db.update(s.statements).set({ status: "CANCELLED", outstandingMinor: 0 }).where(eq(s.statements.id, anaStatement.id)).run();
    expect(view(anaStatement)).toMatchObject({ payable: false, status: "CANCELLED" });
  });
});
