import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import {
  addPaymentMethod,
  deletePaymentMethod,
  getQrForViewer,
  listPaymentMethods,
  savePaymentMethod,
  updatePaymentMethod,
  usedMethodIds,
  type QrChange,
} from "@/server/payments/methods";
import { createTestDb } from "./helpers/db";

let db: Db;
let admin: typeof s.users.$inferSelect;

const gcash = () => db.select().from(s.paymentMethods).where(eq(s.paymentMethods.kind, "GCASH")).get()!;
const complete = { label: "GCash", accountName: "Kovie D.", accountNumber: "0917 123 4567", instructions: null, isActive: true };

/** Changes only the QR, keeping the method's saved details. */
function withQr(id: string, qr: QrChange, actorId: string) {
  const m = db.select().from(s.paymentMethods).where(eq(s.paymentMethods.id, id)).get()!;
  const { label, accountName, accountNumber, instructions, isActive } = m;
  return savePaymentMethod(db, id, { label, accountName, accountNumber, instructions, isActive }, qr, actorId);
}
const replaceQr = (id: string, qr: { file: string; mime: string }, actorId: string) => withQr(id, { kind: "replace", ...qr }, actorId);
const removeQr = (id: string, actorId: string) => withQr(id, { kind: "remove" }, actorId);

beforeEach(() => {
  db = createTestDb();
  admin = db.insert(s.users).values({ email: "boss@example.com", role: "ADMIN" }).returning().get();
  db.insert(s.paymentMethods).values({ kind: "GCASH", label: "GCash", isActive: false, sortOrder: 1 }).run();
});

describe("addPaymentMethod", () => {
  it("adds a switched-off method after the others, with a cleaned name, and audits it", () => {
    const res = addPaymentMethod(db, "  BPI \u200Bsavings ", admin.id);
    expect(res.ok).toBe(true);
    const rows = listPaymentMethods(db, {});
    expect(rows.map((r) => [r.label, r.isActive])).toEqual([["GCash", false], ["BPI savings", false]]);
    expect(rows[1].sortOrder).toBeGreaterThan(rows[0].sortOrder);
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "payment_method.added")).all()).toHaveLength(1);
  });

  it("allows several added methods (the old one-per-kind limit is gone)", () => {
    expect(addPaymentMethod(db, "Maya", admin.id).ok).toBe(true);
    expect(addPaymentMethod(db, "PayPal", admin.id).ok).toBe(true);
    expect(listPaymentMethods(db, {})).toHaveLength(3);
  });

  it("refuses a blank name and a name that already exists, ignoring case", () => {
    expect(addPaymentMethod(db, "   ", admin.id)).toEqual({ ok: false, error: "NO_NAME" });
    expect(addPaymentMethod(db, "gcash", admin.id)).toEqual({ ok: false, error: "DUPLICATE" });
    expect(listPaymentMethods(db, {})).toHaveLength(1);
  });

  it("can then be set up and switched on like any other", () => {
    const added = addPaymentMethod(db, "BPI", admin.id);
    if (!added.ok) throw new Error("not added");
    expect(updatePaymentMethod(db, added.id, { ...complete, label: "BPI" }, admin.id)).toEqual({ ok: true });
    expect(listPaymentMethods(db, { activeOnly: true }).map((r) => r.label)).toEqual(["BPI"]);
  });
});

describe("deletePaymentMethod", () => {
  it("deletes an unused method, hands back its QR file to remove, and audits it", () => {
    replaceQr(gcash().id, { file: "abc.png", mime: "image/png" }, admin.id);
    expect(deletePaymentMethod(db, gcash().id, admin.id)).toEqual({ ok: true, previous: "abc.png" });
    expect(listPaymentMethods(db, {})).toEqual([]);
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "payment_method.deleted")).all()).toHaveLength(1);
  });

  it("refuses to delete a method past payments point to, which can only be switched off", () => {
    const user = db.insert(s.users).values({ email: "ana@example.com" }).returning().get();
    const plan = db.insert(s.subscriptions).values({ name: "Spotify", refPrefix: "SPOT", feeMinor: 7550 }).returning().get();
    const statement = db
      .insert(s.statements)
      .values({ reference: "SPOT-202610-AAAAAA", userId: user.id, subscriptionId: plan.id, period: "2026-10", subscriptionName: "Spotify", amountMinor: 7550, outstandingMinor: 7550, currency: "PHP", issuedAt: new Date(), dueAt: new Date(), status: "UNPAID" })
      .returning()
      .get();
    db.insert(s.payments)
      .values({ statementId: statement.id, userId: user.id, destinationMethodId: gcash().id, sendingApp: "GCash", amountMinor: 7550, transactionRef: "REF1", transactionRefNorm: "REF1", transactionDate: new Date(), status: "PENDING", submittedAt: new Date() })
      .run();
    expect(usedMethodIds(db)).toEqual(new Set([gcash().id]));
    expect(deletePaymentMethod(db, gcash().id, admin.id)).toEqual({ ok: false, error: "IN_USE" });
    expect(listPaymentMethods(db, {})).toHaveLength(1);
  });

  it("says so when the method is already gone", () => {
    expect(deletePaymentMethod(db, "nope", admin.id)).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

describe("updatePaymentMethod", () => {
  it("saves trimmed details and audits which fields changed", () => {
    const res = updatePaymentMethod(db, gcash().id, { ...complete, accountName: "  Kovie D.  " }, admin.id);
    expect(res).toEqual({ ok: true });
    expect(gcash()).toMatchObject({ accountName: "Kovie D.", accountNumber: "0917 123 4567", isActive: true });
    const log = db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "payment_method.updated")).get()!;
    expect(JSON.parse(log.metadata).changed).toEqual(expect.arrayContaining(["accountName", "accountNumber", "isActive"]));
  });

  it("won't switch a method on without who to pay and a number or QR", () => {
    expect(updatePaymentMethod(db, gcash().id, { ...complete, accountName: "", accountNumber: "" }, admin.id)).toEqual({
      ok: false,
      error: "INCOMPLETE",
    });
    expect(updatePaymentMethod(db, gcash().id, { ...complete, accountNumber: "" }, admin.id)).toEqual({ ok: false, error: "INCOMPLETE" });
    expect(gcash().isActive).toBe(false);
  });

  it("accepts a QR instead of a number", () => {
    replaceQr(gcash().id, { file: "a".repeat(32) + ".png", mime: "image/png" }, admin.id);
    expect(updatePaymentMethod(db, gcash().id, { ...complete, accountNumber: "" }, admin.id)).toEqual({ ok: true });
  });

  it("allows saving a draft while it stays inactive, and reports unknown methods", () => {
    expect(updatePaymentMethod(db, gcash().id, { ...complete, accountName: "", accountNumber: "", isActive: false }, admin.id)).toEqual({ ok: true });
    expect(updatePaymentMethod(db, "nope", complete, admin.id)).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

describe("replaceQr / removeQr", () => {
  it("returns the previous file so the caller can delete it", () => {
    const first = { file: "1".repeat(32) + ".png", mime: "image/png" };
    const second = { file: "2".repeat(32) + ".jpg", mime: "image/jpeg" };
    expect(replaceQr(gcash().id, first, admin.id)).toEqual({ ok: true, previous: null });
    expect(replaceQr(gcash().id, second, admin.id)).toEqual({ ok: true, previous: first.file });
    expect(gcash()).toMatchObject({ qrFile: second.file, qrMime: "image/jpeg" });
  });

  it("removes the QR, returning the file to delete", () => {
    const file = "3".repeat(32) + ".png";
    replaceQr(gcash().id, { file, mime: "image/png" }, admin.id);
    expect(removeQr(gcash().id, admin.id)).toEqual({ ok: true, previous: file });
    expect(gcash()).toMatchObject({ qrFile: null, qrMime: null });
  });

  it("refuses to remove the QR from an active method that has no account number (members would have nothing to pay to)", () => {
    replaceQr(gcash().id, { file: "4".repeat(32) + ".png", mime: "image/png" }, admin.id);
    updatePaymentMethod(db, gcash().id, { ...complete, accountNumber: "" }, admin.id);
    expect(removeQr(gcash().id, admin.id)).toEqual({ ok: false, error: "INCOMPLETE" });
    expect(gcash().qrFile).not.toBeNull();
  });
});

describe("savePaymentMethod is atomic", () => {
  it("a rejected activation does not swap the QR either (details and image change together or not at all)", () => {
    const old = { file: "6".repeat(32) + ".png", mime: "image/png" };
    replaceQr(gcash().id, old, admin.id);
    const auditBefore = db.select().from(s.auditLogs).all().length;
    const res = savePaymentMethod(
      db,
      gcash().id,
      { label: "GCash", accountName: null, accountNumber: null, instructions: null, isActive: true }, // no recipient: not payable
      { kind: "replace", file: "7".repeat(32) + ".png", mime: "image/png" },
      admin.id,
    );
    expect(res).toEqual({ ok: false, error: "INCOMPLETE" });
    expect(gcash().qrFile).toBe(old.file);
    expect(db.select().from(s.auditLogs).all()).toHaveLength(auditBefore);
  });

  it("applies details and the new QR together, and reports which old file to delete", () => {
    const old = { file: "8".repeat(32) + ".png", mime: "image/png" };
    replaceQr(gcash().id, old, admin.id);
    const next = { file: "9".repeat(32) + ".jpg", mime: "image/jpeg" };
    const res = savePaymentMethod(db, gcash().id, complete, { kind: "replace", ...next }, admin.id);
    expect(res).toEqual({ ok: true, previous: old.file });
    expect(gcash()).toMatchObject({ isActive: true, accountName: "Kovie D.", qrFile: next.file, qrMime: "image/jpeg" });
  });

  it("keeping the QR never reports a file to delete", () => {
    replaceQr(gcash().id, { file: "a".repeat(32) + ".png", mime: "image/png" }, admin.id);
    expect(savePaymentMethod(db, gcash().id, complete, { kind: "keep" }, admin.id)).toEqual({ ok: true, previous: null });
  });
});

describe("listPaymentMethods", () => {
  it("members only see methods that are active", () => {
    updatePaymentMethod(db, gcash().id, complete, admin.id);
    expect(listPaymentMethods(db, { activeOnly: true }).map((r) => r.kind)).toEqual(["GCASH"]);
    expect(listPaymentMethods(db, {})).toHaveLength(1);
  });
});

describe("getQrForViewer", () => {
  const member = { role: "MEMBER" as const, isActive: true };
  const adminViewer = { role: "ADMIN" as const, isActive: true };
  const file = "5".repeat(32) + ".png";

  beforeEach(() => {
    replaceQr(gcash().id, { file, mime: "image/png" }, admin.id);
  });

  it("serves an active method's QR to any signed-in active user", () => {
    updatePaymentMethod(db, gcash().id, complete, admin.id);
    expect(getQrForViewer(db, member, gcash().id)).toEqual({ file, mime: "image/png", label: "GCash" });
  });

  it("hides an inactive method's QR from members but not from admins", () => {
    expect(getQrForViewer(db, member, gcash().id)).toBeNull();
    expect(getQrForViewer(db, adminViewer, gcash().id)?.file).toBe(file);
  });

  it("refuses deactivated users, unknown methods and methods without a QR", () => {
    updatePaymentMethod(db, gcash().id, complete, admin.id);
    expect(getQrForViewer(db, { role: "ADMIN", isActive: false }, gcash().id)).toBeNull();
    expect(getQrForViewer(db, null, gcash().id)).toBeNull();
    expect(getQrForViewer(db, member, "nope")).toBeNull();
    const maya = db.insert(s.paymentMethods).values({ kind: "MAYA", label: "Maya", isActive: false }).returning().get();
    expect(getQrForViewer(db, adminViewer, maya.id)).toBeNull();
  });
});
