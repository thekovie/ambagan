import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { checkHealth, type Health } from "@/server/health";

// Never cached: the container runtime polls this to decide whether the app is alive.
export const dynamic = "force-dynamic";

export function GET() {
  let result: Health;
  try {
    result = checkHealth(getDb());
  } catch {
    result = { ok: false, database: "unavailable" };
  }
  return NextResponse.json(
    { status: result.ok ? "ok" : "error", database: result.database },
    { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
