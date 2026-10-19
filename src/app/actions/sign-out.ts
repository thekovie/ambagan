"use server";

import { signOut } from "@/server/auth/config";

/** Deletes the database session row, then returns to the sign-in page. */
export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
