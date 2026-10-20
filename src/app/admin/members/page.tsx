import { Users } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listMembers } from "@/server/members/service";
import { listSubscriptions } from "@/server/subscriptions/service";
import { AddMemberForm } from "./add-member-form";
import { MemberRow } from "./member-row";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const admin = await requireAdmin();
  const db = getDb();
  const members = listMembers(db);
  const plans = listSubscriptions(db)
    .filter((p) => p.isActive)
    .map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-display">Members</h1>
        <p className="mt-3 text-muted-foreground">
          Invite friends, pick their plan, and pause anyone who leaves. Deactivating keeps their history and stops new
          statements.
        </p>
      </header>

      <section aria-labelledby="add" className="sheet p-5 sm:p-6 flex max-w-2xl flex-col gap-5">
        <h2 id="add" className="font-display text-title">
          Add a friend
        </h2>
        <AddMemberForm plans={plans} />
      </section>

      <section aria-labelledby="everyone" className="flex flex-col gap-4">
        <h2 id="everyone" className="font-display text-title">
          Everyone ({members.length})
        </h2>
        {members.length === 0 ? (
          <EmptyState icon={<Users />} title="No members yet" description="Add your first friend above and we'll email them an invitation." />
        ) : (
          <ul className="flex flex-col gap-3">
            {members.map((member) => (
              <MemberRow key={member.id} member={{ ...member, isSelf: member.id === admin.id }} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
