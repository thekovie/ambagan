import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { countPendingPayments } from "@/server/payments/verify";

/** The guide is for everyone signed in, so it picks the admin or member shell by role and keeps the same bar and dock. */
export default async function GuideLayout({ children }: { children: ReactNode }) {
  // Server-side gate; the proxy only checks that a session cookie exists.
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  return (
    <AppShell
      variant={isAdmin ? "admin" : "member"}
      user={{ name: user.name ?? null, email: user.email ?? "" }}
      pendingCount={isAdmin ? countPendingPayments(getDb()) : undefined}
    >
      {children}
    </AppShell>
  );
}
