import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import {
  getQrForViewer,
  listPaymentMethods,
  savePaymentMethod,
  seedPaymentMethods,
  updatePaymentMethod,
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
  seedPaymentMethods(db);
});

describe("seedPaymentMethods", () => {
  it("creates GCash, Maya and MariBank, switched off until configured, and never twice", () => {
    seedPaymentMethods(db);
    const rows = listPaymentMethods(db, {});
    expect(rows.map((r) => [r.kind, r.label, r.isActive])).toEqual([
      ["GCASH", "GCash", false],
      ["MAYA", "Maya", false],
      ["MARIBANK", "MariBank QR Ph", false],
    ]);
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
    expect(listPaymentMethods(db, {})).toHaveLength(3);
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
    const maya = db.select().from(s.paymentMethods).where(eq(s.paymentMethods.kind, "MAYA")).get()!;
    expect(getQrForViewer(db, adminViewer, maya.id)).toBeNull();
  });
});
