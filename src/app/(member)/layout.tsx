import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/server/auth/session";

export default async function MemberLayout({ children }: { children: ReactNode }) {
  // Server-side gate; the proxy only checks that a session cookie exists.
  const user = await requireUser();
  return (
    <AppShell variant="member" user={{ name: user.name ?? null, email: user.email ?? "" }}>
      {children}
    </AppShell>
  );
}
