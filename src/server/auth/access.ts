import { eq } from "drizzle-orm";
import { recordAudit } from "@/server/audit";
import type { Db } from "@/server/db/client";
import { users } from "@/server/db/schema";

export type User = typeof users.$inferSelect;

export type SignInCheck = { ok: true; user: User } | { ok: false; reason: "unknown" | "inactive" };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Gate for every sign-in attempt. There is no self-signup: the email must belong
 * to an existing active user, except ADMIN_EMAIL which bootstraps the first admin.
 */
export function checkSignIn(db: Db, rawEmail: string, adminEmail: string): SignInCheck {
  const email = normalizeEmail(rawEmail);
  const isAdminEmail = email === normalizeEmail(adminEmail);

  let user = db.select().from(users).where(eq(users.email, email)).get();
  if (!user && isAdminEmail) {
    const created = db.insert(users).values({ email, role: "ADMIN", name: "Admin" }).onConflictDoNothing().run().changes > 0;
    user = db.select().from(users).where(eq(users.email, email)).get();
    // The only way anyone becomes an admin without another admin doing it: always on the record.
    if (created && user) recordAudit(db, { actorId: user.id, action: "admin.bootstrapped", entityType: "user", entityId: user.id });
  }
  if (!user) return { ok: false, reason: "unknown" };
  if (!user.isActive) return { ok: false, reason: "inactive" };

  if (isAdminEmail && user.role !== "ADMIN") {
    user = db.update(users).set({ role: "ADMIN" }).where(eq(users.id, user.id)).returning().get();
    recordAudit(db, { actorId: user.id, action: "admin.promoted", entityType: "user", entityId: user.id });
  }
  return { ok: true, user };
}
