"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeEmail } from "@/server/auth/access";
import { clientIp } from "@/server/auth/client-ip";
import { signIn } from "@/server/auth/config";
import { loginEmailLimiter, loginIpLimiter } from "@/server/auth/limits";
import { decideLoginAttempt } from "@/server/auth/login-attempt";

export interface LoginState {
  error?: string;
}

const schema = z.object({ email: z.email({ error: "Enter a valid email address." }).max(254) });

export async function requestLoginLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };

  const email = normalizeEmail(parsed.data.email);
  const ip = clientIp(await headers());
  const decision = decideLoginAttempt(email, ip, { email: loginEmailLimiter, ip: loginIpLimiter });
  if (decision === "TOO_MANY") return { error: "Too many attempts. Please wait a few minutes and try again." };
  // A link for this address went out a moment ago: show the usual page and send nothing more (never an error: see limits.ts).
  // Same address as the normal path (Auth.js sends people there), so nobody can tell the two apart.
  if (decision === "QUIET_SKIP") redirect("/login/sent?provider=nodemailer&type=email");

  // Redirects to /login/sent on success. Unknown or deactivated addresses get the same page
  // (no email is sent) so the form can't be used to discover who is in the group.
  await signIn("nodemailer", { email, redirectTo: "/dashboard" });
  return {};
}
