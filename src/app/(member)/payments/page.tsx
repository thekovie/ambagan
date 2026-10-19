import { CircleCheck, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PaymentPill } from "@/components/payment-pill";
import { formatDateTime } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { periodLabel } from "@/server/billing/period";
import { getDb } from "@/server/db/client";
import { listPaymentsForUser } from "@/server/payments/history";

export const metadata: Metadata = { title: "Payment history" };

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const user = await requireUser();
  const { sent } = await searchParams;
  const rows = listPaymentsForUser(getDb(), user.id);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header>
        <h1 className="font-display text-5xl md:text-6xl">Payment history</h1>
        <p className="mt-3 text-muted-foreground">Every payment you&apos;ve reported, and what the admin decided.</p>
      </header>

      {sent === "1" ? (
        <p role="status" className="flex items-start gap-3 rounded-xl bg-secondary p-4 font-semibold">
          <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          Sent. The admin will check that the money arrived and we&apos;ll email you the result.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={<History />}
          title="No payments yet"
          description="When you report a payment it shows up here with its status."
        />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-3xl">{formatMinor(row.amountMinor, row.currency)}</p>
                  <Link
                    href={`/statements/${row.statementId}`}
                    className="font-semibold underline underline-offset-4"
                  >
                    {row.subscriptionName} · {periodLabel(row.period)}
                  </Link>
                </div>
                <PaymentPill status={row.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {row.sendingApp} to {row.destinationLabel} · reference <span className="font-mono">{row.transactionRef}</span>
              </p>
              <p className="text-sm text-muted-foreground">Reported {formatDateTime(row.submittedAt)}</p>
              {row.status === "DECLINED" && row.declineReason ? (
                <p className="text-sm font-semibold">
                  Reason: {row.declineReason}.{" "}
                  <Link href={`/pay/${row.statementId}`} className="underline underline-offset-4">
                    Report it again
                  </Link>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
