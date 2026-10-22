import { Users } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listMembers } from "@/server/members/service";
import { listSubscriptions } from "@/server/subscriptions/service";
import { AddMemberForm } from "./add-member-form";
import { GuestsSection } from "./guests-section";
import { MemberRow } from "./member-row";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const admin = await requireAdmin();
  const db = getDb();
  const everyone = listMembers(db);
  const members = everyone.filter((m) => !m.isGuest);
  const guests = everyone.filter((m) => m.isGuest);
  const plans = listSubscriptions(db)
    .filter((p) => p.isActive)
    .map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-display">Members</h1>
        <p className="mt-3 text-muted-foreground">
          Invite friends so they can sign in, or add people who just need a link. Deactivating someone keeps their history
          and stops new statements.
        </p>
      </header>

      <section aria-labelledby="add" className="sheet p-5 sm:p-6 flex max-w-2xl flex-col gap-5">
        <h2 id="add" className="font-display text-title">
          Add a friend
        </h2>
        <AddMemberForm plans={plans} />
        <p className="text-sm text-muted-foreground">
          Friend doesn&apos;t need to sign in?{" "}
          <a href="#guests" className="font-semibold text-foreground underline underline-offset-4">
            Add them with just a name
          </a>
          , and they pay through a private link.
        </p>
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

      <GuestsSection guests={guests.map((g) => ({ ...g, isSelf: false }))} />
    </div>
  );
}
