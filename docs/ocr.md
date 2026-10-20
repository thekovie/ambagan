# Receipt scanning (browser OCR)

Optional helper on the payment form (`/pay/[statementId]`). The member picks a receipt screenshot; the browser reads it and pre-fills the form; the member checks and submits. **Nothing is uploaded, stored or logged.**

## What leaves the device

Only the fields the member confirms and submits (destination, sending app, amount, reference, date/time, note). The screenshot, the decoded pixels and the raw OCR text stay in browser memory and are discarded: the text is parsed immediately and never put in state, a request or a log. Errors are not logged either, since they could carry receipt text. The server stores no image and has no endpoint that accepts one.

## Pipeline

1. `validateReceiptFile` (`src/lib/ocr/file.ts`): PNG, JPEG or WebP, 1 byte to 10 MB.
2. `prepareImage` (`image.ts`): decodes with `createImageBitmap` (a corrupt or undecodable file raises a friendly error), scales anything larger than 2200 px on its longest side, and redraws to a canvas (which also drops metadata such as location).
3. `recognizeText` (`engine.ts`): Tesseract.js v7, English, LSTM-only. A fresh worker per scan, terminated afterwards or when the member cancels or leaves the page.
4. `parseReceipt` (`parse.ts`): turns text into candidate fields with per-field confidence (see below).
5. `applyReceipt` (`apply.ts`): fills only fields with **high or medium** confidence; never the destination account, the note, or anything it could not read. Each filled field shows "Read from your receipt. Please check it." until the member edits it.

Nothing is ever approved by OCR: the result only pre-fills a form, and every submission still goes to administrator verification.

## Self-hosted assets (no CDN)

`scripts/copy-ocr-assets.mjs` (run automatically by `predev` and `prebuild`) copies into `public/ocr/` (gitignored):

| File | Size | Purpose |
|---|---|---|
| `worker.min.js` | 0.1 MB | Tesseract worker |
| `core/tesseract-core-{lstm,simd-lstm,relaxedsimd-lstm}.wasm.js` | 3.9 MB each | WebAssembly core; the worker loads only the fastest build the browser supports |
| `lang/eng.traineddata.gz` | 2.9 MB | English language data (`@tesseract.js-data/eng`, `4.0.0_best_int`) |

First scan downloads about 7 MB from our own origin (cached by the browser; served with `Cache-Control: public, max-age=2592000`). No request goes to jsdelivr, unpkg or any third party; all three paths are set explicitly in `engine.ts`.

Deployment notes: serve `/ocr/*` as static files; the Content-Security-Policy that ships already allows exactly what the scanner needs (`worker-src 'self' blob:` and `'wasm-unsafe-eval'` in `script-src`, see `src/lib/csp.ts`); the Docker image must run `pnpm build` (which copies the assets) or copy `public/ocr`.

## Parser behaviour (`parse.ts`)

- **Providers:** GCash, Maya, MariBank are recognised by name (earliest mention wins). The recognised app becomes the *sending app*; the member chooses the *destination* separately.
- **Amount:** a labelled total ("Total Amount Sent", "You sent", "Total", "Amount"...) beats everything; account balances and fees are ignored; with no label a single distinct amount is "medium"; several competing amounts give **no amount** and a warning.
- **Reference:** by label ("Ref No.", "Reference ID/Number", "Transaction ID", "Trace No."), either digit groups (GCash style) or a single alphanumeric token of 8+ characters; the value may be on the next line.
- **Date:** month-first, day-first, ISO and unambiguous numeric formats, 12- or 24-hour, read as Manila time; impossible dates and ambiguous orders (10/11/2026) are refused.
- **OCR repair:** `O`, `l`, `I` become digits only inside numeric tokens; any repair lowers confidence to "medium".
- **Unrecognised receipts** are capped at "low" so nothing is pre-filled from, say, a grocery receipt.

## Testing

- `tests/ocr-parsers.test.ts` (21) and `tests/ocr-apply.test.ts` (5) against **synthetic** fixtures in `tests/fixtures/receipts.ts`.
- Browser check against a canvas-rendered synthetic GCash receipt: all four fields read correctly in about one second; corrupt image, PDF and blank image each produce a clear message.

## Known limitations

- **Real-receipt accuracy is unmeasured.** The fixtures only mimic each app's shape. Please test with redacted real receipts from GCash, Maya and MariBank; the parsers will likely need tuning, which is why every filled field is flagged for checking and manual entry always works.
- English only, and screenshots read best: photos of screens may OCR poorly.
- Very old browsers without `createImageBitmap` or WebAssembly will show the "couldn't read" message and fall back to manual entry.
