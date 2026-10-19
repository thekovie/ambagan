import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listPaymentMethods } from "@/server/payments/methods";
import { PaymentMethodForm } from "./payment-method-form";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requireAdmin();
  const methods = listPaymentMethods(getDb(), {});

  return (
    <div className="flex flex-col gap-12">
      <header>
        <h1 className="font-display text-5xl md:text-6xl">Settings</h1>
      </header>

      <section aria-labelledby="methods" className="flex max-w-3xl flex-col gap-2">
        <h2 id="methods" className="font-display text-4xl">
          Payment methods
        </h2>
        <p className="text-muted-foreground">
          Members pay these accounts outside the app, then report the payment here for you to verify. Only methods you
          switch on are shown to members.
        </p>
        <div className="flex flex-col divide-y divide-border">
          {methods.map((method) => (
            <section key={method.id} aria-labelledby={`method-${method.id}`} className="flex flex-col gap-5 py-8">
              <h3 id={`method-${method.id}`} className="font-display text-3xl">
                {method.label}
              </h3>
              <PaymentMethodForm
                method={{
                  id: method.id,
                  label: method.label,
                  accountName: method.accountName,
                  accountNumber: method.accountNumber,
                  instructions: method.instructions,
                  isActive: method.isActive,
                  hasQr: Boolean(method.qrFile),
                }}
              />
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
