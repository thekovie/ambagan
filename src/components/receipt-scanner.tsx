"use client";

import { ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { detectedFields, type DetectedField } from "@/lib/ocr/apply";
import { OcrCancelledError, recognizeText } from "@/lib/ocr/engine";
import { RECEIPT_FILE_MESSAGES, validateReceiptFile } from "@/lib/ocr/file";
import { prepareImage, UnreadableImageError } from "@/lib/ocr/image";
import { parseReceipt, type ParsedReceipt } from "@/lib/ocr/parse";

const FIELD_NAMES: Record<DetectedField, string> = {
  amount: "amount",
  reference: "reference number",
  date: "date and time",
  app: "paying app",
};

type Phase =
  | { kind: "idle" }
  | { kind: "working"; label: string; fraction: number }
  | { kind: "done"; filled: DetectedField[]; warnings: string[] }
  | { kind: "error"; message: string };

interface ReceiptScannerProps {
  /** Apps the form can pick from (a recognised sending app must be one of them). */
  knownApps: string[];
  /** Receives the parsed receipt; the form decides what to fill. Raw OCR text never leaves this component. */
  onDetected: (parsed: ParsedReceipt) => void;
}

/**
 * Optional helper: reads a receipt screenshot entirely in the browser and pre-fills the form for the
 * member to check. The image is never uploaded or stored, and the raw text is discarded right after parsing.
 */
export function ReceiptScanner({ knownApps, onDetected }: ReceiptScannerProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Leaving the page mid-scan stops the worker.
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
      const image = await prepareImage(file);
      const text = await recognizeText(
        image,
        ({ label, fraction }) => setPhase({ kind: "working", label, fraction }),
        controller.signal,
      );
      const parsed = parseReceipt(text);
      onDetected(parsed);
      setPhase({ kind: "done", filled: detectedFields(parsed, knownApps), warnings: parsed.warnings });
    } catch (error) {
      if (error instanceof OcrCancelledError) {
        setPhase({ kind: "idle" });
      } else if (error instanceof UnreadableImageError) {
        setPhase({ kind: "error", message: "We couldn't open that image. Try a screenshot of the receipt instead." });
      } else {
        // Deliberately no logging of the error: it could carry receipt text.
        setPhase({ kind: "error", message: "We couldn't read that receipt. You can fill in the details by hand below." });
      }
    } finally {
      controllerRef.current = null;
      // Lets the same file be chosen again.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const working = phase.kind === "working";

  return (
    <section aria-labelledby="scan-heading" className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-input p-5">
      <h3 id="scan-heading" className="font-display text-2xl">
        Scan your receipt <span className="text-muted-foreground">(optional)</span>
      </h3>
      <p className="text-sm text-muted-foreground">
        Pick the screenshot from your wallet or bank app and we&apos;ll fill in what we can read. It&apos;s read on this
        device only: the image is never uploaded or saved.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void scan(file);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={working} onClick={() => inputRef.current?.click()}>
          <ScanLine data-icon="inline-start" /> {phase.kind === "done" ? "Scan another" : "Choose screenshot"}
        </Button>
        {working ? (
          <Button type="button" variant="ghost" onClick={() => controllerRef.current?.abort()}>
            Cancel
          </Button>
        ) : null}
      </div>

      {phase.kind === "working" ? (
        <div className="flex flex-col gap-2">
          <progress
            max={1}
            value={phase.fraction}
            aria-label={phase.label}
            className="h-2 w-full overflow-hidden rounded-full accent-candy"
          />
          <p className="text-sm font-semibold">{phase.label}</p>
        </div>
      ) : null}

      {/* Always mounted so the result is announced when it appears. */}
      <div role="status" aria-live="polite" className="text-sm empty:hidden">
        {phase.kind === "done" ? (
          <>
            <p className="font-semibold">
              {phase.filled.length > 0
                ? `Filled in: ${phase.filled.map((f) => FIELD_NAMES[f]).join(", ")}. Please check each one against your receipt.`
                : "We couldn't read any details from that image. Please fill them in below."}
            </p>
            {phase.warnings.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {phase.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
      {phase.kind === "error" ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {phase.message}
        </p>
      ) : null}
    </section>
  );
}
