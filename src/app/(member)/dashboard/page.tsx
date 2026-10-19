import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Home" };

// Placeholder: the statement dashboard lands in feat/member-dashboard.
export default async function DashboardPage() {
  const user = await requireUser();
  const firstName = user.name?.trim().split(/\s+/)[0];
  return (
    <div>
      <h1 className="font-display text-5xl md:text-6xl">{firstName ? `Hi, ${firstName}` : "Hi there"}</h1>
      <p className="mt-3 text-muted-foreground">Your statements will show up here.</p>
    </div>
  );
}
