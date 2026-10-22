import { cleanFreeText } from "@/lib/names";
import { asc, eq } from "drizzle-orm";
import type { PaymentMethodKind } from "@/lib/enums";
import { recordAudit } from "@/server/audit";
import { notifyPaymentDetailsChanged } from "@/server/email/notify";
import type { Db } from "@/server/db/client";
import { paymentMethods } from "@/server/db/schema";

export type PaymentMethod = typeof paymentMethods.$inferSelect;

const asDb = (tx: unknown) => tx as Db;

const DEFAULTS: { kind: PaymentMethodKind; label: string }[] = [
  { kind: "GCASH", label: "GCash" },
  { kind: "MAYA", label: "Maya" },
  { kind: "MARIBANK", label: "MariBank QR Ph" },
];

/** First run: the three supported destinations, switched off until the admin fills them in. */
export function seedPaymentMethods(db: Db): void {
  DEFAULTS.forEach((method, index) => {
    db.insert(paymentMethods).values({ ...method, isActive: false, sortOrder: index + 1 }).onConflictDoNothing().run();
  });
}

export function listPaymentMethods(db: Db, options: { activeOnly?: boolean }): PaymentMethod[] {
  return db
    .select()
    .from(paymentMethods)
    .where(options.activeOnly ? eq(paymentMethods.isActive, true) : undefined)
    .orderBy(asc(paymentMethods.sortOrder))
    .all();
}

// Labels and instructions reach email subjects ("payment details changed"), so hidden characters are removed like anywhere else.
const clean = (value: string | null | undefined): string | null => (value ? cleanFreeText(value) : "") || null;

/** A method members can actually pay to needs a recipient and either an account number or a QR. */
const isPayable = (m: { accountName: string | null; accountNumber: string | null; qrFile: string | null }) =>
  Boolean(m.accountName && (m.accountNumber || m.qrFile));

export interface PaymentMethodInput {
  label: string;
  accountName: string | null;
  accountNumber: string | null;
  instructions: string | null;
  isActive: boolean;
}

/** What to do with the QR image in the same save as the details. */
export type QrChange = { kind: "keep" } | { kind: "remove" } | { kind: "replace"; file: string; mime: string };

export type SaveMethodResult =
  /** `previous` is the image file that is no longer referenced: the caller deletes it after this commit. */
  | { ok: true; previous: string | null }
  | { ok: false; error: "NOT_FOUND" | "INCOMPLETE" };

/**
 * Saves details and QR change in ONE transaction, so an error (for example switching a method on
 * without a recipient) can never leave the image half-swapped. Payability is judged on the
 * state that would result, so uploading a QR and activating in the same save is fine.
 */
export function savePaymentMethod(
  db: Db,
  id: string,
  input: PaymentMethodInput,
  qr: QrChange,
  actorId: string,
): SaveMethodResult {
  return db.transaction((tx): SaveMethodResult => {
    const t = asDb(tx);
    const current = t.select().from(paymentMethods).where(eq(paymentMethods.id, id)).get();
    if (!current) return { ok: false, error: "NOT_FOUND" };

    const nextQr =
      qr.kind === "replace" ? { qrFile: qr.file, qrMime: qr.mime } : qr.kind === "remove" ? { qrFile: null, qrMime: null } : { qrFile: current.qrFile, qrMime: current.qrMime };
    const next = {
      label: clean(input.label) ?? current.label,
      accountName: clean(input.accountName),
      accountNumber: clean(input.accountNumber),
      instructions: clean(input.instructions),
      isActive: input.isActive,
      ...nextQr,
    };
    if (next.isActive && !isPayable(next)) return { ok: false, error: "INCOMPLETE" };

    const changed = (Object.keys(next) as (keyof typeof next)[]).filter((key) => current[key] !== next[key]);
    if (changed.length === 0) return { ok: true, previous: null };
    t.update(paymentMethods).set(next).where(eq(paymentMethods.id, id)).run();
    // Field names only: the audit log never needs the account details themselves.
    recordAudit(t, {
      actorId,
      action: "payment_method.updated",
      entityType: "payment_method",
      entityId: id,
      metadata: { kind: current.kind, changed: changed.filter((key) => key !== "qrMime") },
    });
    // People pay whatever is shown here, so a change to where the money goes (or switching a method on) is announced.
    const labels: string[] = [];
    if (changed.includes("accountName")) labels.push("account holder");
    if (changed.includes("accountNumber")) labels.push("account number");
    if (changed.includes("qrFile")) labels.push("QR code");
    const becameActive = next.isActive && !current.isActive;
    if (next.isActive && (labels.length > 0 || becameActive)) {
      notifyPaymentDetailsChanged(t, {
        method: { id: current.id, label: next.label },
        changed: labels.length > 0 ? labels : ["availability"],
        actorId,
        now: new Date(),
      });
    }
    return { ok: true, previous: current.qrFile && current.qrFile !== next.qrFile ? current.qrFile : null };
  });
}

/** Details only (no QR change). */
export function updatePaymentMethod(db: Db, id: string, input: PaymentMethodInput, actorId: string) {
  const result = savePaymentMethod(db, id, input, { kind: "keep" }, actorId);
  return result.ok ? ({ ok: true } as const) : result;
}

interface Viewer {
  role: "MEMBER" | "ADMIN";
  isActive: boolean;
}

/**
 * Authorisation for serving a QR image: any active signed-in user may fetch an *active* method's QR;
 * a method that is switched off is visible to admins only.
 */
export function getQrForViewer(
  db: Db,
  viewer: Viewer | null,
  id: string,
): { file: string; mime: string; label: string } | null {
  if (!viewer || !viewer.isActive) return null;
  const method = db.select().from(paymentMethods).where(eq(paymentMethods.id, id)).get();
  if (!method?.qrFile || !method.qrMime) return null;
  if (!method.isActive && viewer.role !== "ADMIN") return null;
  return { file: method.qrFile, mime: method.qrMime, label: method.label };
}
