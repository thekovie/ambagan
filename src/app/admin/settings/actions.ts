"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assetsDir, deleteImage, saveImage } from "@/server/assets/store";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { savePaymentMethod, type QrChange } from "@/server/payments/methods";

export interface MethodFormState {
  errors?: Record<string, string>;
  error?: string;
  saved?: boolean;
  /** Typed values echoed on error so React's post-action reset doesn't wipe them. */
  values?: Record<string, string>;
}

const schema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1, "Give it a name").max(40, "Keep the name under 40 characters"),
  accountName: z.string().trim().max(80, "Keep it under 80 characters"),
  accountNumber: z.string().trim().max(60, "Keep it under 60 characters"),
  instructions: z.string().trim().max(500, "Keep instructions under 500 characters"),
});

const UPLOAD_ERRORS = {
  EMPTY: "That file is empty.",
  TOO_LARGE: "That image is too large. Keep it under 1.5 MB.",
  UNSUPPORTED_TYPE: "Upload a PNG, JPG or WebP image.",
  WRITE_FAILED: "Couldn't store that image on the server. Nothing was changed; try again.",
} as const;

function textValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") values[key] = value;
  return values;
}

/**
 * Saves one payment method: details, active flag and an optional QR replacement or removal, in a
 * single database transaction. A new image is written first and deleted again if the save fails;
 * the old image is deleted only after the save has committed.
 */
export async function savePaymentMethodAction(_prev: MethodFormState, formData: FormData): Promise<MethodFormState> {
  const admin = await requireAdmin();
  const values = textValues(formData);
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values };
  }

  const dir = assetsDir();
  const upload = formData.get("qr");
  let qr: QrChange = { kind: "keep" };
  let newFile: string | null = null;

  if (upload instanceof File && upload.size > 0) {
    // Validated by signature, size and type before anything is stored.
    const saved = saveImage(dir, new Uint8Array(await upload.arrayBuffer()));
    if (!saved.ok) return { errors: { qr: UPLOAD_ERRORS[saved.error] }, values };
    newFile = saved.file;
    qr = { kind: "replace", file: saved.file, mime: saved.mime };
  } else if (values.removeQr === "on") {
    qr = { kind: "remove" };
  }

  let result;
  try {
    result = savePaymentMethod(
      getDb(),
      parsed.data.id,
      {
        label: parsed.data.label,
        accountName: parsed.data.accountName || null,
        accountNumber: parsed.data.accountNumber || null,
        instructions: parsed.data.instructions || null,
        isActive: values.isActive === "on",
      },
      qr,
      admin.id,
    );
  } catch (error) {
    if (newFile) deleteImage(dir, newFile);
    console.error("Saving payment method failed", error instanceof Error ? error.message : error);
    return { error: "Couldn't save, and nothing was changed. Please try again.", values };
  }

  if (!result.ok) {
    if (newFile) deleteImage(dir, newFile);
    if (result.error === "NOT_FOUND") return { error: "That payment method no longer exists.", values };
    return {
      errors: {
        [qr.kind === "remove" ? "qr" : "isActive"]:
          qr.kind === "remove"
            ? "Add an account number before removing the QR, so members still have something to pay to."
            : "To switch this on, add who to pay and either an account number or a QR.",
      },
      values,
    };
  }

  // The old image goes only now that the database no longer points at it.
  if (result.previous) deleteImage(dir, result.previous);
  revalidatePath("/admin/settings");
  return { saved: true };
}
