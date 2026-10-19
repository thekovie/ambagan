import { eq } from "drizzle-orm";
import { recordAudit } from "@/server/audit";
import type { Db } from "@/server/db/client";
import { users } from "@/server/db/schema";

const MAX_NAME_LENGTH = 80;

export type RenameResult = { ok: true } | { ok: false; error: "INVALID_NAME" | "NOT_FOUND" };

/** A member changing their own display name. The only profile field members may edit. */
export function updateOwnName(db: Db, input: { userId: string; name: string }): RenameResult {
  const name = input.name.trim();
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) return { ok: false, error: "INVALID_NAME" };

  return db.transaction((tx): RenameResult => {
    const t = tx as unknown as Db;
    const updated = t.update(users).set({ name }).where(eq(users.id, input.userId)).returning({ id: users.id }).get();
    if (!updated) return { ok: false, error: "NOT_FOUND" };
    recordAudit(t, { actorId: input.userId, action: "member.renamed", entityType: "user", entityId: input.userId });
    return { ok: true };
  });
}
