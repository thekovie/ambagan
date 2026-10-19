import { ArrowRight, QrCode, ReceiptText } from "lucide-react";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { Sachet } from "@/components/sachet";
import { AppShell } from "@/components/shell/app-shell";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { STATEMENT_STATUSES } from "@/lib/enums";
import { TearDemo } from "./tear-demo";

export const metadata = { title: "Design kit" };

/** Dev-only gallery of the design system. 404s in production. */
export default function KitPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <AppShell variant="member" footer={<p className="truncate text-sm font-bold">Sample Member</p>}>
      <div className="flex flex-col gap-12">
        <header>
          <p className="text-sm font-semibold text-muted-foreground">Good evening, Sample</p>
          <h1 className="font-display mt-1 text-5xl md:text-6xl">What you owe this month</h1>
        </header>

        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
          <Sachet
            status="UNPAID"
            subscriptionName="Spotify"
            periodLabel="October 2026"
            stubLabel="OCT"
            amountMinor={5000}
            currency="PHP"
            dateLabel="Due Sat, Oct 10"
            reference="SPOT-202610-A1B2C3"
          >
            <Button variant="foil" size="lg" className="w-full sm:w-auto">
              Submit payment <ArrowRight data-icon="inline-end" />
            </Button>
            <Button variant="outline" className="w-full border-current bg-transparent text-inherit hover:bg-black/15 sm:w-auto">
              <QrCode data-icon="inline-start" /> Payment QR
            </Button>
          </Sachet>

          <section aria-labelledby="earlier" className="flex flex-col gap-4">
            <h2 id="earlier" className="font-display text-3xl">
              Earlier strips
            </h2>
            <div className="rack">
              <Sachet
                hung
                compact
                status="OVERDUE"
                subscriptionName="Spotify"
                periodLabel="July 2026"
                stubLabel="JUL"
                amountMinor={5000}
                currency="PHP"
                dateLabel="Was due Jul 10"
                reference="SPOT-202607-B7N5HX"
              >
                <Button variant="inverse" className="w-full sm:w-auto">
                  Submit payment <ArrowRight data-icon="inline-end" />
                </Button>
              </Sachet>
              <Sachet
                hung
                compact
                status="UNDER_VERIFICATION"
                subscriptionName="Spotify"
                periodLabel="September 2026"
                stubLabel="SEP"
                amountMinor={5000}
                currency="PHP"
                dateLabel="Submitted Sep 9"
                reference="SPOT-202609-K4M2Q8"
              />
              <Sachet
                hung
                compact
                status="PAID"
                subscriptionName="Spotify"
                periodLabel="August 2026"
                stubLabel="AUG"
                amountMinor={5000}
                currency="PHP"
                dateLabel="Paid Aug 8"
                reference="SPOT-202608-T9W3ZD"
              />
              <Sachet
                hung
                compact
                status="CANCELLED"
                subscriptionName="Spotify"
                periodLabel="June 2026"
                stubLabel="JUN"
                amountMinor={5000}
                currency="PHP"
                dateLabel="Cancelled Jun 3"
                reference="SPOT-202606-C2D8LP"
              />
            </div>
          </section>
        </div>

        <section aria-labelledby="tear" className="flex flex-col gap-4">
          <h2 id="tear" className="font-display text-3xl">
            The tear
          </h2>
          <TearDemo />
        </section>

        <section aria-labelledby="states" className="flex flex-col gap-4">
          <h2 id="states" className="font-display text-3xl">
            Every status
          </h2>
          <div className="flex flex-wrap gap-2">
            {STATEMENT_STATUSES.map((s) => (
              <StatusPill key={s} status={s} />
            ))}
          </div>
        </section>

        <section aria-labelledby="controls" className="flex flex-col gap-4">
          <h2 id="controls" className="font-display text-3xl">
            Controls
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="foil">Pay now</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Cancel statement</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
          </div>
        </section>

        <EmptyState
          icon={<ReceiptText />}
          title="No statements yet"
          description="Your first statement shows up on the 1st of the month. We'll email you when it lands."
          action={<Button variant="outline">Back to home</Button>}
        />
      </div>
    </AppShell>
  );
}
