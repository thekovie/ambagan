import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { countPendingPayments } from "@/server/payments/verify";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Non-admins get a 404 here; actions re-check the role themselves.
  const user = await requireAdmin();
  return (
    <AppShell
      variant="admin"
      user={{ name: user.name ?? null, email: user.email ?? "" }}
      pendingCount={countPendingPayments(getDb())}
    >
      {children}
    </AppShell>
  );
}
