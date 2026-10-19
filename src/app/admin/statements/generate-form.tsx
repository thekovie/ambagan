"use client";

import { FilePlus2, TriangleAlert } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { generateStatementsAction, type GenerateState } from "./actions";

interface Option {
  value: string;
  label: string;
}

/** `periods` is newest first: the first entry is the current month. */
export function GenerateForm({ periods, plans }: { periods: Option[]; plans: Option[] }) {
  const [state, action, pending] = useActionState<GenerateState, FormData>(generateStatementsAction, {});
  const [period, setPeriod] = useState(periods[0]?.value ?? "");
  const uid = useId();
  const isBackfill = period !== periods[0]?.value;
  const chosen = periods.find((p) => p.value === period)?.label ?? period;

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-period`}>Month</Label>
          <NativeSelect id={`${uid}-period`} name="period" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {periods.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-plan`}>Plan</Label>
          <NativeSelect id={`${uid}-plan`} name="subscriptionId" defaultValue="">
            <option value="">All active plans</option>
            {plans.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {isBackfill ? (
        <p className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-sm font-semibold">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {chosen} has passed. New statements for it use each plan&apos;s <em>current</em> fee, are dated today, and will
            already be overdue if the due day is behind us. Check the Plans page first.
          </span>
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="text-sm font-semibold empty:hidden">
        {state.message}
      </p>

      <div>
        {isBackfill ? (
          <ConfirmButton disabled={pending} confirmLabel={`Sure? Issue ${chosen}`}>
            <FilePlus2 data-icon="inline-start" />
            Generate missing statements
          </ConfirmButton>
        ) : (
          <Button type="submit" disabled={pending}>
            <FilePlus2 data-icon="inline-start" />
            {pending ? "Generating…" : "Generate missing statements"}
          </Button>
        )}
      </div>
    </form>
  );
}
