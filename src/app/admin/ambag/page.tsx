import { HandCoins, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/server/auth/session";
import { listBills } from "@/server/bills";
import { getDb } from "@/server/db/client";

export const metadata: Metadata = { title: "Ambag" };

export default async function AmbagListPage() {
  await requireAdmin();
  const rows = listBills(getDb());

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-display">Ambag</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            One-off bills the group chips in for: dinner, the internet, a gift. Each friend gets their own share to pay you back.
          </p>
        </div>
        <Link href="/admin/ambag/new" className={cn(buttonVariants({ variant: "candy", size: "lg" }))}>
          <Plus data-icon="inline-start" /> New ambag
        </Link>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<HandCoins />}
          title="No ambag yet"
          description="When you cover something and want the group to chip in, start an ambag. Everyone gets their own link to see and pay their share."
          action={
            <Link href="/admin/ambag/new" className={cn(buttonVariants({ variant: "candy" }))}>
              <Plus data-icon="inline-start" /> New ambag
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ bill, statementCount, paidCount, openCount, outstandingMinor }) => (
            <li key={bill.id}>
              <Link href={`/admin/ambag/${bill.id}`} className="sheet flex flex-col gap-2 p-5 transition-shadow hover:shadow-[var(--sh-dock)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="font-display text-xl">{bill.title}</h2>
                  <span className="font-bold tabular-nums">{formatMinor(bill.totalMinor, bill.currency)}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Due {formatDate(bill.dueAt)} ·{" "}
                  {bill.cancelledAt
                    ? "Cancelled"
                    : statementCount === 0
                      ? "Nobody to collect from"
                      : openCount === 0
                        ? `All ${statementCount} paid`
                        : `${paidCount} of ${statementCount} paid, ${formatMinor(outstandingMinor, bill.currency)} still to collect`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
