export async function register(): Promise<void> {
  // Node only (the edge runtime has no SQLite), and never while `next build` is collecting pages.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  // Node-only code lives in its own file so the edge bundle never sees process.exit / process.on.
  await import("./instrumentation-node");
}
