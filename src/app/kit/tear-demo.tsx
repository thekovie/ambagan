"use client";

import { useState } from "react";
import { Sachet } from "@/components/sachet";
import { Button } from "@/components/ui/button";
import type { StatementStatus } from "@/lib/enums";

/** Kit-only: plays the approval moment (stub tears away) on demand. */
export function TearDemo() {
  const [status, setStatus] = useState<StatementStatus>("UNDER_VERIFICATION");

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Sachet
        status={status}
        justPaid={status === "PAID"}
        subscriptionName="Spotify"
        periodLabel="October 2026"
        stubLabel="OCT"
        amountMinor={5000}
        currency="PHP"
        dateLabel={status === "PAID" ? "Paid Oct 8" : "Submitted Oct 8"}
        reference="SPOT-202610-A1B2C3"
      />
      <div className="flex gap-3">
        <Button onClick={() => setStatus("PAID")} disabled={status === "PAID"}>
          Approve payment
        </Button>
        <Button variant="outline" onClick={() => setStatus("UNDER_VERIFICATION")} disabled={status !== "PAID"}>
          Reset
        </Button>
      </div>
    </div>
  );
}
