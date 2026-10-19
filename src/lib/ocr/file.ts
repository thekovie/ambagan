/** Checks done in the browser before a screenshot is handed to OCR. Nothing here is uploaded. */

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
/** Phone screenshots are usually 0.2-3 MB; this stops a huge photo from freezing the tab. */
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export type ReceiptFileResult = { ok: true } | { ok: false; error: "NOT_AN_IMAGE" | "EMPTY" | "TOO_LARGE" };

export function validateReceiptFile(file: { type: string; size: number }): ReceiptFileResult {
  if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, error: "NOT_AN_IMAGE" };
  if (file.size === 0) return { ok: false, error: "EMPTY" };
  if (file.size > MAX_RECEIPT_BYTES) return { ok: false, error: "TOO_LARGE" };
  return { ok: true };
}

export const RECEIPT_FILE_MESSAGES = {
  NOT_AN_IMAGE: "Pick a screenshot or photo (PNG, JPG or WebP).",
  EMPTY: "That file is empty.",
  TOO_LARGE: "That image is too large. Pick one under 10 MB.",
} as const;
