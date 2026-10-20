import { BadgeCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { CopyField } from "@/components/copy-field";
import { EmptyState } from "@/components/empty-state";
import { PaymentPill } from "@/components/payment-pill";
import { formatDateTime } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { requireAdmin } from "@/server/auth/session";
import { periodLabel } from "@/server/billing/period";
import { getDb } from "@/server/db/client";
import { listPendingPayments, listReviewedPayments } from "@/server/payments/verify";
import { ReviewActions } from "./review-actions";

export const metadata: Metadata = { title: "Verify payments" };

const REVIEWED_LIMIT = 20;

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const db = getDb();
  const pending = listPendingPayments(db);
  const reviewed = listReviewedPayments(db, REVIEWED_LIMIT);

  return (
    <div className="flex flex-col gap-12">
      <header className="max-w-2xl">
        <h1 className="font-display text-5xl md:text-6xl">Verify payments</h1>
        <p className="mt-3 text-muted-foreground">
          Members report payments they made from their own apps. Check each one in the account that received it, then
          approve or decline. We don&apos;t keep receipt screenshots, so there is nothing to compare: the transaction in
          your own account is the evidence.
        </p>
      </header>

      <section aria-labelledby="waiting" className="flex flex-col gap-2">
        <h2 id="waiting" aria-live="polite" className="font-display text-3xl">
          Waiting for you ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <EmptyState
            icon={<BadgeCheck />}
            title="All caught up"
            description="When a member reports a payment it appears here for you to check."
          />
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((p) => {
              const name = p.memberName || p.memberEmail;
              return (
                <li key={p.id} className="flex flex-col gap-5 py-8">
                  <div>
                    <p className="font-display text-3xl">{name}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.subscriptionName} · {periodLabel(p.period)} ·{" "}
                      <span className="font-mono">{p.statementReference}</span>
                    </p>
                  </div>

                  <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground">Statement owes</p>
                      <p className="font-display text-4xl">{formatMinor(p.expectedMinor, p.currency)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground">Member says they sent</p>
                      <p className="font-display text-4xl">{formatMinor(p.submittedMinor, p.currency)}</p>
                    </div>
                  </div>

                  {p.amountMatches ? null : (
                    <p className="flex max-w-2xl items-start gap-2 rounded-xl bg-foil-tangerine p-3 text-sm font-bold text-ink">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      The amounts differ. You can only approve this by recording why you&apos;re accepting it.
                    </p>
                  )}

                  <dl className="grid max-w-2xl gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-muted-foreground">Look in your</dt>
                      <dd className="font-bold">{p.destinationLabel}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">Paid from</dt>
                      <dd className="font-bold">{p.sendingApp}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">Transaction time they gave</dt>
                      <dd className="font-bold">{formatDateTime(p.transactionDate)}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">Reported</dt>
                      <dd className="font-bold">{formatDateTime(p.submittedAt)}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="mb-1 font-semibold text-muted-foreground">Reference number</dt>
                      <dd>
                        <CopyField value={p.transactionRef} label={`Reference number from ${name}`} />
                      </dd>
                    </div>
                    {p.notes ? (
                      <div className="sm:col-span-2">
                        <dt className="font-semibold text-muted-foreground">Their note</dt>
                        <dd className="whitespace-pre-line font-bold">{p.notes}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {p.referenceSeenDeclined || p.previousAttempts.length > 0 ? (
                    <div className="flex max-w-2xl flex-col gap-2 rounded-xl border-2 border-dashed border-input p-4 text-sm">
                      <p className="font-bold">Worth a closer look</p>
                      {p.referenceSeenDeclined ? (
                        <p>This reference number was declined on an earlier report.</p>
                      ) : null}
                      {p.previousAttempts.map((attempt) => (
                        <p key={attempt.id}>
                          Earlier report ({formatMinor(attempt.amountMinor, p.currency)}, ref{" "}
                          <span className="font-mono">{attempt.transactionRef}</span>) was declined
                          {attempt.declineReason ? `: ${attempt.declineReason}` : "."}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  <ReviewActions paymentId={p.id} memberName={name} amountMatches={p.amountMatches} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="history" className="flex flex-col gap-2">
        <h2 id="history" className="font-display text-3xl">
          Recently decided
        </h2>
        {reviewed.length === 0 ? (
          <p className="text-muted-foreground">Nothing decided yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {reviewed.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-bold">
                    {r.memberName || r.memberEmail} · {formatMinor(r.amountMinor, r.currency)} · {r.subscriptionName}{" "}
                    {periodLabel(r.period)}
                  </p>
                  <PaymentPill status={r.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {r.reviewedAt ? formatDateTime(r.reviewedAt) : ""}
                  {r.reviewerName ? ` · by ${r.reviewerName}` : ""} · ref <span className="font-mono">{r.transactionRef}</span>
                </p>
                {r.declineReason ? <p className="text-sm">Reason: {r.declineReason}</p> : null}
                {r.adjustmentNote ? <p className="text-sm">Accepted with a different amount: {r.adjustmentNote}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
