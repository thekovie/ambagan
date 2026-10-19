"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp } from "@/server/auth/client-ip";
import { signIn } from "@/server/auth/config";
import { acceptInvitation } from "@/server/auth/invitations";
import { loginIpLimiter } from "@/server/auth/limits";
import { getDb } from "@/server/db/client";

export async function acceptInvite(token: string) {
  const ip = clientIp(await headers());
  if (!loginIpLimiter.hit(ip).allowed) redirect(`/invite/${encodeURIComponent(token)}`);

  const result = acceptInvitation(getDb(), token);
  // Not valid (expired, reused, deactivated): the page renders the matching message.
  if (result.status !== "valid") redirect(`/invite/${encodeURIComponent(token)}`);

  await signIn("nodemailer", { email: result.user.email, redirectTo: "/dashboard" });
}
