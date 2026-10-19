// Copies the OCR engine, worker and English language data into public/ocr so the browser loads them
// from our own origin (never a CDN). Runs before dev and build; public/ocr is gitignored.
import { copyFileSync, existsSync, mkdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "public", "ocr");

function fail(message) {
  console.error(`copy-ocr-assets: ${message}`);
  process.exit(1);
}

// pnpm links packages into node_modules; resolve the real folder, then its sibling packages.
const tesseractDir = realpathSync(path.join(root, "node_modules", "tesseract.js"));
const coreDir = path.resolve(tesseractDir, "..", "tesseract.js-core");
const langFile = path.join(root, "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz");

// Recognition runs in LSTM-only mode, so only the three LSTM core builds can ever be requested
// (the worker picks the fastest one the browser supports).
const files = [
  [path.join(tesseractDir, "dist", "worker.min.js"), "worker.min.js"],
  ...["tesseract-core-lstm", "tesseract-core-simd-lstm", "tesseract-core-relaxedsimd-lstm"].map((name) => [
    path.join(coreDir, `${name}.wasm.js`),
    path.join("core", `${name}.wasm.js`),
  ]),
  [langFile, path.join("lang", "eng.traineddata.gz")],
];

let copied = 0;
for (const [from, relative] of files) {
  if (!existsSync(from)) fail(`missing ${path.relative(root, from)}. Run "pnpm install" first.`);
  const to = path.join(out, relative);
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied += 1;
}
console.log(`OCR assets ready in public/ocr (${copied} copied, ${files.length - copied} already current)`);
