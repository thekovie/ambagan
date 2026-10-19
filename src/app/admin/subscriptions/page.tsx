import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listSubscriptions } from "@/server/subscriptions/service";
import { SubscriptionForm } from "./subscription-form";

export const metadata: Metadata = { title: "Plans" };

export default async function SubscriptionsPage() {
  await requireAdmin();
  const plans = listSubscriptions(getDb());

  return (
    <div className="flex flex-col gap-12">
      <header>
        <h1 className="font-display text-5xl md:text-6xl">Plans</h1>
        <p className="mt-3 text-muted-foreground">
          Each plan is one shared subscription. Fees and dates here apply to statements issued from now on; statements
          already issued never change.
        </p>
      </header>

      <div className="flex max-w-3xl flex-col divide-y divide-border">
        {plans.map((plan) => (
          <section key={plan.id} aria-labelledby={`plan-${plan.id}`} className="flex flex-col gap-5 py-8 first:pt-0">
            <div>
              <h2 id={`plan-${plan.id}`} className="font-display text-4xl">
                {plan.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-mono">{plan.refPrefix}</span> · {plan.activeMembers}{" "}
                {plan.activeMembers === 1 ? "active member" : "active members"} · {plan.currency}
              </p>
            </div>
            <SubscriptionForm
              subscription={{
                id: plan.id,
                name: plan.name,
                refPrefix: plan.refPrefix,
                feeMinor: plan.feeMinor,
                issueDay: plan.issueDay,
                dueDay: plan.dueDay,
                paymentInstructions: plan.paymentInstructions,
                isActive: plan.isActive,
              }}
            />
          </section>
        ))}

        <section aria-labelledby="new-plan" className="flex flex-col gap-5 py-8">
          <h2 id="new-plan" className="font-display text-4xl">
            Add another plan
          </h2>
          <SubscriptionForm />
        </section>
      </div>
    </div>
  );
}
