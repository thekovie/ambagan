"use client";

import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { detectedFields, type DetectedField } from "@/lib/ocr/apply";
import { parseReceipt, type ParsedReceipt } from "@/lib/ocr/parse";
import { useImageOcr } from "@/lib/ocr/use-image-ocr";

const FIELD_NAMES: Record<DetectedField, string> = {
  amount: "amount",
  reference: "reference number",
  date: "date and time",
  app: "paying app",
};

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
  const { phase, scan, inputRef, cancel } = useImageOcr<ParsedReceipt>({
    parse: parseReceipt,
    onResult: onDetected,
    failureMessage: "We couldn't read that receipt. You can fill in the details by hand below.",
  });
  const filled = phase.kind === "done" ? detectedFields(phase.result, knownApps) : [];
  const warnings = phase.kind === "done" ? phase.result.warnings : [];

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
          <Button type="button" variant="ghost" onClick={cancel}>
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
              {filled.length > 0
                ? `Filled in: ${filled.map((f) => FIELD_NAMES[f]).join(", ")}. Please check each one against your receipt.`
                : "We couldn't read any details from that image. Please fill them in below."}
            </p>
            {warnings.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {warnings.map((w) => (
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
