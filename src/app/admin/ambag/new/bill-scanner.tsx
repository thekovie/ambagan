"use client";

import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scanSummary } from "@/lib/ocr/apply-bill";
import { BILL_MAX_SIDE } from "@/lib/ocr/image";
import { parseBillReceipt, type BillScan } from "@/lib/ocr/parse-bill";
import { useImageOcr } from "@/lib/ocr/use-image-ocr";

const RECOGNIZE = { layout: true };

/**
 * Optional helper for the itemised form: reads a photo of a shop or restaurant receipt on this device and hands the
 * items, extras and total to the form for the admin to check. The image is never uploaded or stored, and the raw
 * text is discarded right after parsing.
 */
export function BillScanner({ onScanned }: { onScanned: (scan: BillScan) => void }) {
  const { phase, scan, inputRef, cancel } = useImageOcr<BillScan>({
    parse: parseBillReceipt,
    onResult: onScanned,
    failureMessage: "We couldn't read that receipt. You can add the items by hand below.",
    maxSide: BILL_MAX_SIDE,
    recognize: RECOGNIZE,
  });
  const working = phase.kind === "working";
  const summary = phase.kind === "done" ? scanSummary(phase.result) : null;

  return (
    <section aria-labelledby="bill-scan-heading" className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-input p-4">
      <h4 id="bill-scan-heading" className="font-display text-lg">
        Scan a receipt <span className="text-muted-foreground">(optional)</span>
      </h4>
      <p className="text-sm text-muted-foreground">
        Pick a photo of the bill and we&apos;ll fill in the items we can read. It&apos;s read on this device only: the image is never uploaded or saved.
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
          <ScanLine data-icon="inline-start" /> {phase.kind === "done" ? "Scan another" : "Choose photo"}
        </Button>
        {working ? (
          <Button type="button" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        ) : null}
      </div>

      {phase.kind === "working" ? (
        <div className="flex flex-col gap-2">
          <progress max={1} value={phase.fraction} aria-label={phase.label} className="h-2 w-full overflow-hidden rounded-full accent-candy" />
          <p className="text-sm font-semibold">{phase.label}</p>
        </div>
      ) : null}

      {/* Always mounted so the result is announced when it appears. */}
      <div role="status" aria-live="polite" className="text-sm empty:hidden">
        {summary ? (
          <>
            <p className="font-semibold">{summary.headline}</p>
            {summary.notes.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {summary.notes.map((note) => (
                  <li key={note}>{note}</li>
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
