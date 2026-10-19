import "server-only";
import type { Session } from "next-auth";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { canAccess } from "./roles";
import { auth } from "./config";

export type SessionUser = Session["user"];

/** Current user for this request (deduplicated per render), or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  // A deactivated member with a live cookie is treated as signed out (avoids a /login <-> /dashboard loop).
  return session?.user?.isActive ? session.user : null;
});

/**
 * Server-side gate for member pages and actions. Never rely on the proxy redirect alone:
 * it only checks that a cookie exists.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!canAccess(user, "MEMBER")) redirect("/login");
  return user as SessionUser;
}

/** Admin gate. Signed-in non-admins get a 404 so admin routes are not discoverable. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || !user.isActive) redirect("/login");
  if (!canAccess(user, "ADMIN")) notFound();
  return user;
}
