import { eq } from "drizzle-orm";
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
    db.insert(users).values({ email, role: "ADMIN", name: "Admin" }).onConflictDoNothing().run();
    user = db.select().from(users).where(eq(users.email, email)).get();
  }
  if (!user) return { ok: false, reason: "unknown" };
  if (!user.isActive) return { ok: false, reason: "inactive" };

  if (isAdminEmail && user.role !== "ADMIN") {
    user = db.update(users).set({ role: "ADMIN" }).where(eq(users.id, user.id)).returning().get();
  }
  return { ok: true, user };
}
