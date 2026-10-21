import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDate } from "@/lib/dates";
import { STATEMENT_STATUSES } from "@/lib/enums";
import { formatMinor } from "@/lib/money";
import { STATUS_META } from "@/lib/status";
import { effectiveStatus } from "@/lib/statement-view";
import { requireAdmin } from "@/server/auth/session";
import { periodLabel, RECENT_PERIOD_COUNT, recentPeriods } from "@/server/billing/period";
import { listStatements } from "@/server/billing/statements";
import { getDb } from "@/server/db/client";
import { listJobRuns } from "@/server/jobs/runner";
import { DAILY_JOB } from "@/server/jobs/schedule";
import { listSubscriptions } from "@/server/subscriptions/service";
import { CancelStatement } from "./cancel-statement";
import { DailyRunPanel } from "./daily-run-panel";
import { GenerateForm } from "./generate-form";

export const metadata: Metadata = { title: "Statements" };

export default async function AdminStatementsPage({ searchParams }: PageProps<"/admin/statements">) {
  await requireAdmin();
  const params = await searchParams;
  const db = getDb();

  const now = new Date();
  const periods = recentPeriods(now, RECENT_PERIOD_COUNT).map((p) => ({ value: p, label: periodLabel(p) }));
  // Only offered months are applied, so the dropdown always shows the filter that is active.
  const period = periods.find((p) => p.value === params.period)?.value;
  const status = STATEMENT_STATUSES.find((s) => s === params.status);

  const rows = listStatements(db, { period, status, now });
  const plans = listSubscriptions(db)
    .filter((p) => p.isActive)
    .map((p) => ({ value: p.id, label: p.name }));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-display">Statements</h1>
        <p className="mt-3 text-muted-foreground">
          Issue a month&apos;s statements, fill in any that are missing, or cancel one. Running it again never creates
          duplicates or changes statements that already exist.
        </p>
      </header>

      <DailyRunPanel runs={listJobRuns(db, DAILY_JOB, 5)} />

      <section aria-labelledby="generate" className="sheet p-5 sm:p-6 flex max-w-2xl flex-col gap-4">
        <h2 id="generate" className="font-display text-title">
          Generate missing
        </h2>
        <GenerateForm periods={periods} plans={plans} />
      </section>

      <section aria-labelledby="all" className="flex flex-col gap-5">
        <h2 id="all" className="font-display text-title">
          All statements ({rows.length})
        </h2>

        <form method="get" className="flex flex-wrap items-end gap-4">
          <div className="flex min-w-44 flex-col gap-2">
            <Label htmlFor="filter-period">Month</Label>
            <NativeSelect id="filter-period" name="period" defaultValue={period ?? ""}>
              <option value="">All months</option>
              {periods.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex min-w-44 flex-col gap-2">
            <Label htmlFor="filter-status">Status</Label>
            <NativeSelect id="filter-status" name="status" defaultValue={status ?? ""}>
              <option value="">Any status</option>
              {STATEMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>

        {rows.length === 0 ? (
          <EmptyState
            icon={<ReceiptText />}
            title="No statements match"
            description="Nothing here yet for that filter. Generate a month above, or clear the filters."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => {
              const shown = effectiveStatus(row, now);
              return (
                <li key={row.id} className="sheet flex flex-col gap-3 p-4 sm:p-5">
                  <div className="grid items-start gap-x-6 gap-y-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{row.memberName || row.memberEmail}</p>
                      <p className="truncate text-sm text-muted-foreground">{row.memberEmail}</p>
                      <p className="mt-1 font-mono text-xs">{row.reference}</p>
                    </div>
                    <div>
                      <p className="font-bold">
                        {row.billId ? `${row.subscriptionName} · Ambag` : `${periodLabel(row.period)} · ${row.subscriptionName}`}
                      </p>
                      <p className="text-sm">
                        {formatMinor(row.amountMinor, row.currency)}
                        {row.outstandingMinor !== row.amountMinor ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · owes {formatMinor(row.outstandingMinor, row.currency)}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-sm text-muted-foreground">Due {formatDate(row.dueAt)}</p>
                    </div>
                    <StatusPill status={shown} />
                  </div>
                  {row.status === "UNPAID" || row.status === "OVERDUE" ? (
                    <CancelStatement statementId={row.id} reference={row.reference} />
                  ) : null}
                  {row.status === "CANCELLED" && row.cancelReason ? (
                    <p className="text-sm text-muted-foreground">Cancelled: {row.cancelReason}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
