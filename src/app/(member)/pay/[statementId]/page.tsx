import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentMethodsList, methodCard } from "@/components/payment-methods-list";
import { Sticker } from "@/components/sticker";
import { toLocalInputValue } from "@/lib/dates";
import { effectiveStatus, stickerProps } from "@/lib/statement-view";
import { requireUser } from "@/server/auth/session";
import { getStatementForUser } from "@/server/billing/statements";
import { getDb } from "@/server/db/client";
import { listPaymentMethods } from "@/server/payments/methods";
import { submitPaymentAction } from "./actions";
import { PaymentForm } from "./payment-form";

export const metadata: Metadata = { title: "Report a payment" };

export default async function PayPage({ params }: PageProps<"/pay/[statementId]">) {
  const user = await requireUser();
  const { statementId } = await params;
  const db = getDb();
  const statement = getStatementForUser(db, user.id, statementId);
  if (!statement) notFound();

  const shown = effectiveStatus(statement);
  const payable = shown === "UNPAID" || shown === "OVERDUE";
  const methods = listPaymentMethods(db, { activeOnly: true });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <Link href={`/statements/${statement.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground underline underline-offset-4">
          Back to the statement
        </Link>
        <h1 className="font-display mt-2 text-display">Report your payment</h1>
      </header>

      <Sticker compact {...stickerProps(statement)} />

      {!payable ? (
        <p className="text-muted-foreground">
          This statement isn&apos;t waiting for a payment right now.{" "}
          <Link href={`/statements/${statement.id}`} className="font-semibold text-foreground underline underline-offset-4">
            See where it stands
          </Link>
          .
        </p>
      ) : methods.length === 0 ? (
        <p className="text-muted-foreground">
          The admin hasn&apos;t set up a payment method yet, so there&apos;s nowhere to report a payment to. Please ask them to add one.
        </p>
      ) : (
        <>
          <section aria-labelledby="where" className="sheet flex flex-col gap-4 p-5 sm:p-6">
            <h2 id="where" className="font-display text-title">
              1. Send the money
            </h2>
            <p className="text-muted-foreground">Pay from your own wallet or bank app using one of these, then come back here.</p>
            <PaymentMethodsList methods={methods.map(methodCard)} />
          </section>

          <section aria-labelledby="report" className="sheet flex flex-col gap-4 p-5 sm:p-6">
            <h2 id="report" className="font-display text-title">
              2. Tell us what you sent
            </h2>
            <PaymentForm
              statementId={statement.id}
              currency={statement.currency}
              outstandingMinor={statement.outstandingMinor}
              action={submitPaymentAction}
              methods={methods.map((m) => ({ id: m.id, label: m.label, accountName: m.accountName }))}
              defaultDate={toLocalInputValue(new Date())}
            />
          </section>
        </>
      )}
    </div>
  );
}
