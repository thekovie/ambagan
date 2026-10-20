"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getEnv } from "@/env";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { invitationEmail } from "@/server/email/auth-templates";
import { recordDirectEmail } from "@/server/email/queue";
import { sendMail } from "@/server/email/transport";
import { promoteGuest } from "@/server/members/guests";
import { addMember, resendInvitation, setMemberActive } from "@/server/members/service";

export interface InviteResult {
  email: string;
  url: string;
  /** False when SMTP failed: the admin can still share `url` by hand. */
  emailSent: boolean;
}

export interface MemberActionState {
  error?: string;
  invite?: InviteResult;
  /** Submitted fields, echoed back on error so React's post-action form reset doesn't wipe them. */
  values?: { name: string; email: string; subscriptionId: string };
}

const ERRORS = {
  EMAIL_TAKEN: "That email is already on the list.",
  SUBSCRIPTION_NOT_FOUND: "That plan no longer exists. Refresh and try again.",
  SUBSCRIPTION_INACTIVE: "That plan is switched off. Turn it on in Plans, or pick another.",
  NOT_FOUND: "That member no longer exists.",
  INACTIVE: "Reactivate this member before sending an invite.",
  GUEST: "This friend is a guest. Use Invite to join to make them a member.",
  SELF: "You can't deactivate your own account.",
  LAST_ADMIN: "There must always be at least one active admin.",
} as const;

async function deliverInvite(user: { email: string; name: string | null }, token: string): Promise<InviteResult> {
  const url = `${getEnv().APP_URL}/invite/${token}`;
  const mail = invitationEmail({ name: user.name, url });
  let error: string | undefined;
  try {
    await sendMail({ to: user.email, ...mail });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
    console.error("Invitation email failed to send", error);
  }
  // The log never holds the link: it is a one-time secret.
  try {
    recordDirectEmail(getDb(), { type: "INVITATION", toEmail: user.email, subject: mail.subject, error });
  } catch (logError) {
    // Never lose the fallback link over a logging problem.
    console.error("Could not log an invitation email", logError instanceof Error ? logError.message : logError);
  }
  return { email: user.email, url, emailSent: !error };
}

const addSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80, "Keep the name under 80 characters"),
  email: z.email("Enter a valid email address").max(254),
  subscriptionId: z.string().optional(),
});

export async function addMemberAction(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const admin = await requireAdmin();
  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    subscriptionId: String(formData.get("subscriptionId") ?? ""),
  };
  const parsed = addSchema.safeParse({ ...values, subscriptionId: values.subscriptionId || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again.", values };

  const result = addMember(getDb(), {
    name: parsed.data.name,
    email: parsed.data.email,
    subscriptionId: parsed.data.subscriptionId ?? null,
    invitedBy: admin.id,
  });
  if (!result.ok) return { error: ERRORS[result.error], values };

  const invite = await deliverInvite(result.user, result.invitation.token);
  revalidatePath("/admin/members");
  return { invite };
}

export async function resendInviteAction(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const result = resendInvitation(getDb(), { userId, actorId: admin.id });
  if (!result.ok) return { error: ERRORS[result.error] };

  const invite = await deliverInvite(result.user, result.invitation.token);
  revalidatePath("/admin/members");
  return { invite };
}

const PROMOTE_ERRORS = {
  FORBIDDEN: "Only an admin can invite someone to join.",
  NOT_A_GUEST: "That friend is already a member.",
  INACTIVE: "Reactivate this friend before inviting them to join.",
  EMAIL_REQUIRED: "Enter their email address so we can send the invitation.",
  EMAIL_INVALID: "That doesn't look like an email address.",
  EMAIL_TAKEN: "That email is already on the list.",
} as const;

/** "Invite to join": turns a guest into a member and sends their invitation (the same person, so their history stays). */
export async function promoteGuestAction(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const admin = await requireAdmin();
  const result = promoteGuest(getDb(), {
    userId: String(formData.get("userId") ?? ""),
    email: String(formData.get("email") ?? ""),
    actorId: admin.id,
  });
  if (!result.ok) return { error: PROMOTE_ERRORS[result.error] };

  const invite = await deliverInvite(result.user, result.invitation.token);
  revalidatePath("/admin/members");
  return { invite };
}

export async function setActiveAction(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const active = formData.get("active") === "true";
  const result = setMemberActive(getDb(), { userId, active, actorId: admin.id });
  if (!result.ok) return { error: ERRORS[result.error] };

  revalidatePath("/admin/members");
  return {};
}
