import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Sticker } from "@/components/sticker";
import { StatementAction } from "@/components/statement-action";
import { WelcomeCard } from "@/components/welcome-card";
import { formatDate, formatDateTime, greeting } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { stickerProps } from "@/lib/statement-view";
import { requireUser } from "@/server/auth/session";
import { getMemberDashboard } from "@/server/billing/dashboard";
import { periodLabel } from "@/server/billing/period";
import type { Statement } from "@/server/billing/statements";
import { getDb } from "@/server/db/client";

export const metadata: Metadata = { title: "Home" };

// Home is for acting; the full history is one tap away.
const ACTIVITY_SHOWN = 4;

function StatementLink({ statement }: { statement: Statement }) {
  return (
    <Link href={`/statements/${statement.id}`} className="block rounded-lg outline-offset-4">
      <Sticker compact {...stickerProps(statement)} />
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const { primary, attention, recent, owing, upcoming, activity } = getMemberDashboard(getDb(), user.id, now, { activityLimit: ACTIVITY_SHOWN });
  const firstName = user.name?.trim().split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-12">
      <header>
        <p className="text-sm font-semibold text-muted-foreground">{greeting(now)}</p>
        <h1 className="font-display mt-1 text-display">{firstName ? `Hi, ${firstName}` : "Hi there"}</h1>
        {owing && owing.count > 1 ? (
          <p className="mt-2 text-lg">
            You owe <strong className="font-bold">{formatMinor(owing.totalMinor, owing.currency)}</strong> in all, across {owing.count} bills.
          </p>
        ) : null}
      </header>

      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-12">
          {primary ? (
            <Sticker {...stickerProps(primary, now)}>
              <StatementAction statement={primary} />
            </Sticker>
          ) : (
            <EmptyState
              icon={<ReceiptText />}
              title="Nothing to pay yet"
              description="Your first statement or ambag shows up here as soon as it's issued, and we'll email you when it lands."
            />
          )}

          {/* Below the main sticker, so the one thing to pay is never pushed down by a hint. */}
          <WelcomeCard />

          {attention.length > 0 ? (
            <section aria-labelledby="attention" className="flex flex-col gap-4">
              <h2 id="attention" className="font-display text-title">
                Also waiting on you
              </h2>
              <div className="sticker-sheet">
                {attention.map((statement) => (
                  <StatementLink key={statement.id} statement={statement} />
                ))}
              </div>
            </section>
          ) : null}

          {recent.length > 0 ? (
            <section aria-labelledby="earlier" className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="earlier" className="font-display text-title">
                  Earlier statements
                </h2>
                <Link href="/statements" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
                  See all
                </Link>
              </div>
              <div className="sticker-sheet">
                {recent.map((statement) => (
                  <StatementLink key={statement.id} statement={statement} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-12">
          {upcoming.length > 0 ? (
            <section aria-labelledby="upcoming" className="flex flex-col gap-3">
              <h2 id="upcoming" className="font-display text-title">
                Coming up
              </h2>
              <ul className="divide-y divide-border">
                {upcoming.map((next) => (
                  <li key={`${next.planName}-${next.period}`} className="py-3">
                    <p className="font-bold">
                      {next.planName} · {periodLabel(next.period)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Issued {formatDate(next.issueOn)} · {formatMinor(next.feeMinor, next.currency)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {activity.length > 0 ? (
            <section aria-labelledby="activity" className="flex flex-col gap-3">
              <h2 id="activity" className="font-display text-title">
                Recent activity
              </h2>
              <ul className="divide-y divide-border">
                {activity.map((item) => (
                  <li key={`${item.kind}-${item.statementId}-${item.at.getTime()}`} className="py-3">
                    <Link
                      href={`/statements/${item.statementId}`}
                      className="inline-flex min-h-11 items-center font-bold underline-offset-4 hover:underline"
                    >
                      {item.label}
                    </Link>
                    <p className="text-sm text-muted-foreground">{formatDateTime(item.at)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="reminders" className="flex flex-col gap-2">
            <h2 id="reminders" className="font-display text-title">
              Reminders
            </h2>
            <p className="text-muted-foreground">
              We email <strong className="text-foreground">{user.email}</strong> when a statement is issued, the day before
              it&apos;s due, on the due date, and if it becomes overdue.{" "}
              <Link href="/settings" className="inline-flex min-h-11 items-center font-semibold text-foreground underline underline-offset-4">
                Account settings
              </Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
