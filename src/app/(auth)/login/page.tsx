import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-display">Sign in</h1>
        <p className="mt-3 text-muted-foreground">
          Use the email you were invited with. We&apos;ll send a one-time link, so there&apos;s no password to remember.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
