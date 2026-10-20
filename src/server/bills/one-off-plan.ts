import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { subscriptions } from "@/server/db/schema";
import { ONE_OFF_PREFIX } from "@/server/subscriptions/service";

type Plan = typeof subscriptions.$inferSelect;

const randomLetters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + randomInt(26))).join("");

/**
 * Every ambag statement needs a plan row (statements are keyed to one), so all bills share a single hidden
 * "one-off" plan: inactive, free, no members, never listed and never generated for. Created on first use, inside
 * the caller's transaction, rather than in a migration (the default Spotify plan only seeds on an empty table).
 *
 * New installs get the AMBAG prefix. A database where a monthly plan already took it (before the prefix was
 * reserved) falls back to AMB plus three random letters.
 */
export function ensureOneOffPlan(t: Db): Plan {
  const existing = t.select().from(subscriptions).where(eq(subscriptions.kind, "ONE_OFF")).get();
  if (existing) return existing;

  for (let attempt = 0; attempt < 20; attempt++) {
    const refPrefix = attempt === 0 ? ONE_OFF_PREFIX : `AMB${randomLetters(3)}`;
    if (t.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.refPrefix, refPrefix)).get()) continue;
    return t
      .insert(subscriptions)
      .values({ name: "Ambag (one-off bills)", refPrefix, feeMinor: 0, currency: "PHP", isActive: false, kind: "ONE_OFF" })
      .returning()
      .get();
  }
  throw new Error("Could not find a free reference prefix for one-off bills");
}
