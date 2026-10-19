import type { ReactNode } from "react";
import { AccountFooter } from "@/components/auth/account-footer";
import { AppShell } from "@/components/shell/app-shell";
import { requireAdmin } from "@/server/auth/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Non-admins get a 404 here; actions re-check the role themselves.
  const user = await requireAdmin();
  return (
    <AppShell variant="admin" footer={<AccountFooter name={user.name ?? null} email={user.email ?? ""} />}>
      {children}
    </AppShell>
  );
}
