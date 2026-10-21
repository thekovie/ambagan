/**
 * Browser-only OCR using Tesseract.js. Everything is same-origin: the worker, the WebAssembly core
 * and the language data are served from /ocr (copied there by scripts/copy-ocr-assets.mjs), so
 * nothing is fetched from a CDN and no image or text is ever sent to a server.
 */

export interface OcrProgress {
  label: string;
  /** 0 to 1 within the current stage. */
  fraction: number;
}

const STAGE_LABELS: Record<string, string> = {
  "loading tesseract core": "Preparing the reader…",
  "initializing tesseract": "Preparing the reader…",
  "loading language traineddata": "Loading language data…",
  "initializing api": "Starting…",
  "recognizing text": "Reading your receipt…",
};

export class OcrCancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "OcrCancelledError";
  }
}

export interface RecognizeOptions {
  /** Read the page as one block and keep the spacing between columns, so a price stays on its item's line. */
  layout?: boolean;
}

/** Returns the recognised text. The caller parses it and then drops it: raw text is never stored or logged. */
export async function recognizeText(
  image: Blob,
  onProgress: (progress: OcrProgress) => void,
  signal?: AbortSignal,
  options: RecognizeOptions = {},
): Promise<string> {
  const { createWorker, PSM } = await import("tesseract.js");
  if (signal?.aborted) throw new OcrCancelledError();

  const worker = await createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr/lang",
    logger: (message) => onProgress({ label: STAGE_LABELS[message.status] ?? "Working…", fraction: message.progress }),
  });

  if (options.layout) await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });

  const cancel = () => void worker.terminate();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const { data } = await worker.recognize(image);
    if (signal?.aborted) throw new OcrCancelledError();
    return data.text;
  } catch (error) {
    if (signal?.aborted) throw new OcrCancelledError();
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    await worker.terminate().catch(() => undefined);
  }
}
