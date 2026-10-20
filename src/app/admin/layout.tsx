import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireAdmin } from "@/server/auth/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Non-admins get a 404 here; actions re-check the role themselves.
  const user = await requireAdmin();
  return (
    <AppShell variant="admin" user={{ name: user.name ?? null, email: user.email ?? "" }}>
      {children}
    </AppShell>
  );
}
