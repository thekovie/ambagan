import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { getEnv } from "@/env";
import { formatDate } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/server/auth/session";
import { isPlaceholderEmail } from "@/lib/guest";
import { getBillDetail } from "@/server/bills";
import { getDb } from "@/server/db/client";
import { shareLinkPath } from "@/server/share/token";
import { CancelBillForm, ShareActions } from "./bill-actions";

export const metadata: Metadata = { title: "Ambag" };

const HOW: Record<string, string> = {
  EQUAL: "Split equally",
  SHARES: "Split by shares",
  PERCENT: "Split by percentage",
  EXACT: "Set amounts",
  ITEMS: "Split by what each person had",
};

export default async function AmbagDetailPage({ params, searchParams }: PageProps<"/admin/ambag/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { created } = await searchParams;
  const detail = getBillDetail(getDb(), id);
  if (!detail) notFound();

  const { bill, rows, adminShareMinor } = detail;
  const appUrl = getEnv().APP_URL;
  const money = (minor: number) => formatMinor(minor, bill.currency);
  const collectedMinor = rows.filter((r) => r.status === "PAID").reduce((sum, r) => sum + r.amountMinor, 0);
  const owedMinor = rows.reduce((sum, r) => sum + r.outstandingMinor, 0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/admin/ambag" className="text-sm font-semibold text-muted-foreground underline underline-offset-4">
          All ambag
        </Link>
        <h1 className="font-display text-display mt-2">{bill.title}</h1>
        <p className="mt-2 text-muted-foreground">
          {money(bill.totalMinor)} · {HOW[bill.splitMethod]} · due {formatDate(bill.dueAt)}
          {bill.cancelledAt ? " · Cancelled" : ""}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          You paid {money(bill.totalMinor)}; your own share is {money(adminShareMinor)}.
        </p>
        {bill.note ? <p className="mt-2 whitespace-pre-line">{bill.note}</p> : null}
      </header>

      {created === "1" ? (
        <p role="status" className="flex items-start gap-3 rounded-2xl bg-st-mint p-4 font-semibold text-st-ink">
          <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          Created. Friends with an email are being emailed. For everyone else, copy their link or message below and send it however you like.
        </p>
      ) : null}

      <section aria-label="Where it stands" className="grid grid-cols-2 gap-3">
        {[
          ["Collected", money(collectedMinor), "bg-st-mint"],
          ["Still to collect", money(owedMinor), "bg-st-butter"],
        ].map(([label, value, tone]) => (
          <div key={label} className={`rounded-2xl p-4 text-st-ink ${tone}`}>
            <p className="text-sm font-semibold">{label}</p>
            <p className="font-display text-2xl tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="people" className="flex flex-col gap-3">
        <h2 id="people" className="font-display text-title">
          Everyone&apos;s share
        </h2>
        {rows.length === 0 ? <p className="text-muted-foreground">Nobody to collect from: only your own share is in this one.</p> : null}
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const url = `${appUrl}${shareLinkPath(row)}`;
            const first = row.memberName.split(/\s+/)[0];
            const message = `Hi ${first}! Your ambag for ${bill.title} is ${money(row.amountMinor)}, due ${formatDate(bill.dueAt)}. See how it was split and how to pay: ${url}`;
            return (
              <li key={row.id} className="sheet flex flex-col gap-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-xl">{row.memberName}</span>
                    {row.isGuest ? <span className="rounded-full bg-st-butter px-2.5 py-0.5 text-xs font-bold text-st-ink">Guest</span> : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold tabular-nums">{money(row.amountMinor)}</span>
                    <StatusPill status={row.status} />
                  </div>
                </div>
                {row.status === "UNDER_VERIFICATION" ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-muted-foreground">{first} says they paid. Check your account, then approve it.</p>
                    <Link href="/admin/payments" className={cn(buttonVariants({ variant: "candy" }))}>
                      Review payment
                    </Link>
                  </div>
                ) : null}
                <ShareActions
                  billId={bill.id}
                  statementId={row.id}
                  name={row.memberName}
                  url={url}
                  message={message}
                  open={row.status === "UNPAID" || row.status === "OVERDUE"}
                  userId={row.userId}
                  email={isPlaceholderEmail(row.memberEmail) ? null : row.memberEmail}
                  isGuest={row.isGuest}
                />
              </li>
            );
          })}
        </ul>
      </section>

      {bill.cancelledAt ? null : (
        <section aria-labelledby="cancel" className="sheet flex flex-col gap-3 p-5 sm:p-6">
          <h2 id="cancel" className="font-display text-title">
            Made a mistake?
          </h2>
          <p className="text-sm text-muted-foreground">
            An ambag can&apos;t be edited once it&apos;s sent: cancel it and make a new one. Cancelling only works while nobody has paid or reported paying.
          </p>
          <CancelBillForm billId={bill.id} />
        </section>
      )}
    </div>
  );
}
