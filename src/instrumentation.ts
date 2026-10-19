export async function register(): Promise<void> {
  // Node only (the edge runtime has no SQLite), and never while `next build` is collecting pages.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { startScheduler } = await import("./server/jobs/scheduler");
  startScheduler();
}
