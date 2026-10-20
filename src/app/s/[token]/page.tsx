import { CircleCheck, Hourglass, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PaymentForm } from "@/app/(member)/pay/[statementId]/payment-form";
import { PaymentMethodsList } from "@/components/payment-methods-list";
import { Sticker } from "@/components/sticker";
import { toLocalInputValue } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import type { SplitMethod } from "@/lib/split";
import { stickerProps } from "@/lib/statement-view";
import { getDb } from "@/server/db/client";
import { requireShareAccess } from "@/server/share/access";
import { getShareLinkView } from "@/server/share/view";
import { submitSharedPaymentAction } from "./actions";

const HOW: Record<SplitMethod, string> = {
  EQUAL: "split equally",
  SHARES: "split by shares",
  PERCENT: "split by percentage",
  EXACT: "split by set amounts",
  ITEMS: "split by what each person had",
};

function Notice({ icon, children, tone = "info" }: { icon: ReactNode; children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <p role="status" className={`flex items-start gap-3 rounded-2xl p-4 font-semibold ${tone === "warn" ? "bg-st-butter text-st-ink" : "bg-secondary"}`}>
      <span className="mt-0.5 shrink-0 [&_svg]:size-5" aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </p>
  );
}

/** One person's private page for their share of an ambag: what they owe and why, how to pay, and reporting it. */
export default async function SharePage({ params, searchParams }: PageProps<"/s/[token]">) {
  const { token } = await params;
  const access = await requireShareAccess(token);
  if (!access.ok) {
    if (access.limited) {
      return (
        <section className="sheet mt-4 p-6">
          <h1 className="font-display text-title">Too many tries</h1>
          <p className="mt-2 text-muted-foreground">Please wait a few minutes and try again.</p>
        </section>
      );
    }
    notFound(); // the same answer for a wrong, replaced or expired link
  }

  const now = new Date();
  const view = getShareLinkView(getDb(), access, now);
  const { sent } = await searchParams;
  const firstName = access.user.name?.trim().split(/\s+/)[0];
  const { share, status, latestPayment } = view;
  const declined = latestPayment?.status === "DECLINED" && view.payable;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-muted-foreground">{firstName ? `Hi ${firstName}, here's your ambag` : "Your ambag"}</p>
        <h1 className="font-display text-display mt-1">{share.title}</h1>
      </header>

      <Sticker {...stickerProps(view.statement, now)} />

      {sent === "1" ? (
        <Notice icon={<CircleCheck />}>Sent. The admin will check that the money arrived, then this will show as paid.</Notice>
      ) : status === "UNDER_VERIFICATION" ? (
        <Notice icon={<Hourglass />}>Thanks! Your payment is waiting for the admin to check it.</Notice>
      ) : status === "PAID" ? (
        <Notice icon={<CircleCheck />}>All settled. Thank you for chipping in!</Notice>
      ) : status === "CANCELLED" ? (
        <Notice icon={<CircleCheck />}>This ambag was cancelled. Nothing is owed.</Notice>
      ) : null}

      {declined ? (
        <Notice icon={<TriangleAlert />} tone="warn">
          Your last report was declined{latestPayment?.declineReason ? `: ${latestPayment.declineReason.replace(/[.\s]+$/, "")}` : ""}. You can report it again below.
        </Notice>
      ) : null}

      <section aria-labelledby="split" className="sheet flex flex-col gap-3 p-5 sm:p-6">
        <h2 id="split" className="font-display text-title">
          How this was split
        </h2>
        {share.note ? <p className="whitespace-pre-line">{share.note}</p> : null}
        <p className="text-muted-foreground">
          {formatMinor(share.totalMinor, view.statement.currency)} in total, {HOW[share.method]} between {share.participantCount}{" "}
          {share.participantCount === 1 ? "person" : "people"}.
        </p>
        <ul className="flex flex-col divide-y divide-border">
          {share.lines.map((line, index) => (
            <li key={index} className="flex items-baseline justify-between gap-4 py-2">
              <span>
                <span className="font-semibold">{line.label}</span>
                {line.note ? <span className="block text-sm text-muted-foreground">{line.note}</span> : null}
              </span>
              <span className="font-bold">
                {line.amountMinor < 0 ? "−" : ""}
                {formatMinor(Math.abs(line.amountMinor), view.statement.currency)}
              </span>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-4 pt-3 text-lg font-bold">
            <span>Your share</span>
            <span>{formatMinor(share.amountMinor, view.statement.currency)}</span>
          </li>
        </ul>
      </section>

      {view.payable ? (
        view.methods.length === 0 ? (
          <p className="text-muted-foreground">The admin hasn&apos;t set up a payment method yet, so there&apos;s nowhere to send this. Please ask them to add one.</p>
        ) : (
          <>
            <section aria-labelledby="where" className="sheet flex flex-col gap-4 p-5 sm:p-6">
              <h2 id="where" className="font-display text-title">
                1. Send the money
              </h2>
              <p className="text-muted-foreground">Pay from your own wallet or bank app using one of these, then come back here.</p>
              <PaymentMethodsList methods={view.methods} qrPath={(id) => `/api/s/${token}/qr/${id}`} />
            </section>

            <section aria-labelledby="report" className="sheet flex flex-col gap-4 p-5 sm:p-6">
              <h2 id="report" className="font-display text-title">
                2. Tell us what you sent
              </h2>
              <PaymentForm
                action={submitSharedPaymentAction.bind(null, token)}
                statementId={view.statement.id}
                currency={view.statement.currency}
                outstandingMinor={view.statement.outstandingMinor}
                methods={view.methods.map((m) => ({ id: m.id, label: m.label, accountName: m.accountName }))}
                defaultDate={toLocalInputValue(now)}
              />
            </section>
          </>
        )
      ) : null}
    </div>
  );
}
