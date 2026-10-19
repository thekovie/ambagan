import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { PrintButton } from "@/components/print-button";
import { Sachet } from "@/components/sachet";
import { StatementAction } from "@/components/statement-action";
import { formatLongDate } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { STATUS_META } from "@/lib/status";
import { effectiveStatus, sachetProps } from "@/lib/statement-view";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { periodLabel } from "@/server/billing/period";
import { getStatementForUser } from "@/server/billing/statements";
import { getDb } from "@/server/db/client";
import { subscriptions } from "@/server/db/schema";

export const metadata: Metadata = { title: "Statement" };

export default async function StatementPage({ params }: PageProps<"/statements/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const db = getDb();
  // Ownership is part of the query: someone else's statement is a 404, not a 403.
  const statement = getStatementForUser(db, user.id, id);
  if (!statement) notFound();

  const plan = db.select().from(subscriptions).where(eq(subscriptions.id, statement.subscriptionId)).get();
  const shown = effectiveStatus(statement);

  const details: [string, string][] = [
    ["Reference", statement.reference],
    ["Subscription", statement.subscriptionName],
    ["Billing period", periodLabel(statement.period)],
    ["Issued", formatLongDate(statement.issuedAt)],
    ["Due", formatLongDate(statement.dueAt)],
    ["Amount", formatMinor(statement.amountMinor, statement.currency)],
    ["Outstanding balance", formatMinor(statement.outstandingMinor, statement.currency)],
    ["Status", STATUS_META[shown].label],
  ];
  // The admin's internal reason stays admin-only (it can mention other people); members just see who cancelled.
  if (statement.status === "CANCELLED") details.push(["Note", "Cancelled by admin. Nothing is owed on this statement."]);

  return (
    <div className="flex flex-col gap-10">
      {/* Print-only letterhead; the on-screen strip below is hidden when printing. */}
      <div className="hidden items-center justify-between border-b border-border pb-4 print:flex">
        <Wordmark />
        <p className="font-display text-3xl">Statement of Account</p>
      </div>

      <header className="print:hidden">
        <Link href="/statements" className="text-sm font-semibold text-muted-foreground underline underline-offset-4">
          All statements
        </Link>
        <h1 className="font-display mt-2 text-5xl md:text-6xl">{periodLabel(statement.period)}</h1>
      </header>

      <Sachet className="max-w-2xl print:hidden" {...sachetProps(statement)}>
        <StatementAction statement={statement} omitView />
      </Sachet>

      <section aria-labelledby="details" className="flex max-w-2xl flex-col gap-4">
        <h2 id="details" className="font-display text-3xl">
          Statement details
        </h2>
        <dl className="divide-y divide-border">
          {details.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-6">
              <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
              <dd className={cn("font-bold sm:text-right", label === "Reference" && "font-mono text-sm")}>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {plan?.paymentInstructions && (shown === "UNPAID" || shown === "OVERDUE") ? (
        <section aria-labelledby="how-to-pay" className="flex max-w-2xl flex-col gap-3">
          <h2 id="how-to-pay" className="font-display text-3xl">
            How to pay
          </h2>
          <p className="whitespace-pre-line">{plan.paymentInstructions}</p>
        </section>
      ) : null}

      <div>
        <PrintButton />
      </div>
    </div>
  );
}
