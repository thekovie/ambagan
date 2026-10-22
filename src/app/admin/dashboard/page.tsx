import { ArrowRight, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Sticker } from "@/components/sticker";
import { buttonVariants } from "@/components/ui/button";
import type { StatementStatus } from "@/lib/enums";
import { formatMinor } from "@/lib/money";
import { STATUS_META } from "@/lib/status";
import { stickerProps } from "@/lib/statement-view";
import { requireAdmin } from "@/server/auth/session";
import { periodLabel } from "@/server/billing/period";
import { getAdminOverview } from "@/server/billing/overview";
import { getDb } from "@/server/db/client";
import { SetupChecklist } from "@/components/setup-checklist";
import { getSetupProgress } from "@/server/setup/progress";

export const metadata: Metadata = { title: "Overview" };

const SEGMENT_COLORS: Record<StatementStatus, string> = {
  PAID: "bg-st-mint",
  UNDER_VERIFICATION: "bg-st-butter",
  UNPAID: "bg-st-sky",
  OVERDUE: "bg-st-rose",
  CANCELLED: "bg-muted",
};
const LEGEND_ORDER: StatementStatus[] = ["PAID", "UNDER_VERIFICATION", "UNPAID", "OVERDUE"];

export default async function AdminDashboardPage() {
  await requireAdmin();
  const now = new Date();
  const overview = getAdminOverview(getDb(), now);
  const setup = getSetupProgress(getDb());
  const { cycle, tickets } = overview;
  const month = periodLabel(overview.period);
  const currency = tickets[0]?.statement.currency ?? "PHP";

  const counts = new Map<StatementStatus, number>();
  for (const t of tickets) counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
  const breakdown = LEGEND_ORDER.filter((s) => counts.has(s)).map((s) => `${counts.get(s)} ${STATUS_META[s].label.toLowerCase()}`);

  const attention: { href: string; label: string; value: string; urgent: boolean }[] = [
    { href: "/admin/payments", label: "Payments to verify", value: String(overview.pendingVerification), urgent: overview.pendingVerification > 0 },
    { href: "/admin/statements?status=OVERDUE", label: "Overdue statements", value: String(overview.overdueCount), urgent: overview.overdueCount > 0 },
    { href: "/admin/statements", label: "Still owed, all months", value: formatMinor(overview.outstandingMinor, currency), urgent: false },
    { href: "/admin/members", label: "Active members", value: String(overview.activeMembers), urgent: false },
  ];

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-display">Overview</h1>
        <p className="mt-3 text-muted-foreground">{month}</p>
      </header>

      <SetupChecklist progress={setup} />

      {/* Before setup is done the checklist above is the whole story: no empty state and no row of zeros. */}
      {cycle.count === 0 && setup.complete ? (
        <EmptyState
          icon={<ReceiptText />}
          title={`Nothing issued for ${month} yet`}
          description="Once this month's statements exist you'll see who has paid at a glance."
          action={
            <Link href="/admin/statements" className={buttonVariants({ variant: "default" })}>
              Generate statements <ArrowRight data-icon="inline-end" />
            </Link>
          }
        />
      ) : null}

      {cycle.count > 0 ? (
        <section aria-labelledby="collected" className="flex max-w-3xl flex-col gap-4">
          <h2 id="collected" className="sr-only">
            Collections for {month}
          </h2>
          <p className="font-display text-[clamp(2.75rem,8vw,5rem)]">
            {formatMinor(cycle.collectedMinor, currency)}
            <span className="text-muted-foreground"> of {formatMinor(cycle.chargedMinor, currency)}</span>
          </p>
          <p className="text-muted-foreground">
            collected for {month} · {cycle.paidCount} of {cycle.count} paid
          </p>
          <div
            role="img"
            aria-label={`${month}: ${breakdown.join(", ")}`}
            className="flex h-4 gap-1 overflow-hidden rounded-full"
          >
            {tickets.map((t) => (
              <span key={t.statement.id} className={`flex-1 ${SEGMENT_COLORS[t.status]}`} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
            {LEGEND_ORDER.filter((s) => counts.has(s)).map((s) => (
              <li key={s} className="flex items-center gap-2">
                <span aria-hidden="true" className={`size-3 rounded-full ${SEGMENT_COLORS[s]}`} />
                {counts.get(s)} {STATUS_META[s].label.toLowerCase()}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {setup.complete || cycle.count > 0 ? (
        <section aria-labelledby="needs" className="flex max-w-2xl flex-col gap-2">
          <h2 id="needs" className="font-display text-title">
            At a glance
          </h2>
          <ul className="divide-y divide-border">
            {attention.map((row) => (
              <li key={row.label}>
                <Link href={row.href} className="flex min-h-14 items-center justify-between gap-4 py-2 hover:bg-muted/60">
                  <span className="font-semibold">{row.label}</span>
                  <span className="flex items-center gap-2">
                    <span className={row.urgent ? "font-display rounded-full bg-candy px-3 py-1 text-2xl text-on-candy" : "font-display text-2xl"}>
                      {row.value}
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tickets.length > 0 ? (
        <section aria-labelledby="month-stickers" className="flex flex-col gap-5">
          <h2 id="month-stickers" className="font-display text-title">
            {month} stickers
          </h2>
          <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {tickets.map((t) => (
              <li key={t.statement.id}>
                <Sticker compact {...stickerProps(t.statement, now)} subscriptionName={t.memberName} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
