/** Browser-only. The image never leaves memory: it is decoded, optionally shrunk, and handed to OCR. */

const MAX_SIDE = 2200;

export class UnreadableImageError extends Error {
  constructor() {
    super("The image could not be opened");
    this.name = "UnreadableImageError";
  }
}

/**
 * Decodes the screenshot and scales a very large one down so recognition stays quick on a phone.
 * Redrawing also drops any metadata (such as location) the original carried.
 */
export async function prepareImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Corrupt files, or a type the browser can't decode despite the file extension.
    throw new UnreadableImageError();
  }

  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new UnreadableImageError();
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new UnreadableImageError())), "image/png"),
    );
  } finally {
    bitmap.close();
  }
}
