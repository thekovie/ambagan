"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp } from "@/server/auth/client-ip";
import { signIn } from "@/server/auth/config";
import { acceptInvitation } from "@/server/auth/invitations";
import { inviteIpLimiter } from "@/server/auth/limits";
import { getDb } from "@/server/db/client";

export async function acceptInvite(token: string) {
  const ip = clientIp(await headers());
  if (inviteIpLimiter.isLimited(ip)) redirect(`/invite/${encodeURIComponent(token)}`);

  const result = acceptInvitation(getDb(), token);
  // Not valid (expired, reused, deactivated): the page renders the matching message. Only these count against the limit.
  if (result.status !== "valid") {
    inviteIpLimiter.hit(ip);
    redirect(`/invite/${encodeURIComponent(token)}`);
  }

  await signIn("nodemailer", { email: result.user.email, redirectTo: "/dashboard" });
}
