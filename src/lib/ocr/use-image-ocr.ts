"use client";

import { useEffect, useRef, useState } from "react";
import { OcrCancelledError, recognizeText, type RecognizeOptions } from "./engine";
import { RECEIPT_FILE_MESSAGES, validateReceiptFile } from "./file";
import { prepareImage, UnreadableImageError } from "./image";

export type OcrPhase<T> =
  | { kind: "idle" }
  | { kind: "working"; label: string; fraction: number }
  | { kind: "done"; result: T }
  | { kind: "error"; message: string };

interface UseImageOcrOptions<T> {
  /** Turns the recognised text into whatever the form needs. The raw text never leaves this hook. */
  parse: (text: string) => T;
  /** Receives the parsed result; the form decides what to fill. */
  onResult: (result: T) => void;
  /** What to say when the receipt could not be read. */
  failureMessage: string;
  maxSide?: number;
  recognize?: RecognizeOptions;
}

/**
 * The shared "pick an image, read it on this device, parse it" flow behind the payment and bill scanners. The image
 * is never uploaded or stored, the raw text is parsed immediately and dropped, and errors are deliberately not logged
 * because they could carry receipt text. Leaving the page mid-scan stops the worker.
 */
export function useImageOcr<T>({ parse, onResult, failureMessage, maxSide, recognize }: UseImageOcrOptions<T>) {
  const [phase, setPhase] = useState<OcrPhase<T>>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function scan(file: File) {
    const check = validateReceiptFile(file);
    if (!check.ok) {
      setPhase({ kind: "error", message: RECEIPT_FILE_MESSAGES[check.error] });
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase({ kind: "working", label: "Opening the image…", fraction: 0 });
    try {
      const image = await prepareImage(file, maxSide);
      const text = await recognizeText(image, ({ label, fraction }) => setPhase({ kind: "working", label, fraction }), controller.signal, recognize);
      const result = parse(text);
      onResult(result);
      setPhase({ kind: "done", result });
    } catch (error) {
      if (error instanceof OcrCancelledError) {
        setPhase({ kind: "idle" });
      } else if (error instanceof UnreadableImageError) {
        setPhase({ kind: "error", message: "We couldn't open that image. Try a screenshot or a clear photo of the receipt instead." });
      } else {
        setPhase({ kind: "error", message: failureMessage });
      }
    } finally {
      controllerRef.current = null;
      // Lets the same file be chosen again.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return { phase, scan, inputRef, cancel: () => controllerRef.current?.abort() };
}
