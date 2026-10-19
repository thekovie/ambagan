import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/session";

export const metadata: Metadata = { title: "Admin overview" };

// Placeholder: the overview lands in feat/admin-overview.
export default async function AdminDashboardPage() {
  await requireAdmin();
  return (
    <div>
      <h1 className="font-display text-5xl md:text-6xl">Overview</h1>
      <p className="mt-3 text-muted-foreground">Collections, balances and the verification queue will show up here.</p>
    </div>
  );
}
