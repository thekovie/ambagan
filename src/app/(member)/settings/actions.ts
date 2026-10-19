"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { updateOwnName } from "@/server/members/profile";

export interface ProfileState {
  error?: string;
  saved?: boolean;
  /** Echoed on error so React's post-action form reset doesn't wipe what was typed. */
  values?: { name: string };
}

export async function updateProfileAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "");
  const result = updateOwnName(getDb(), { userId: user.id, name });
  if (!result.ok) {
    return {
      error: result.error === "INVALID_NAME" ? "Enter a name up to 80 characters." : "We couldn't find your account.",
      values: { name },
    };
  }
  // The name also appears in the shell's account area, so refresh every member page.
  revalidatePath("/", "layout");
  return { saved: true };
}
