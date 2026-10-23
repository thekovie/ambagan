"use client";

import { Plus } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFocusFirstError } from "@/lib/use-focus-first-error";
import { addPaymentMethodAction, type AddMethodState } from "./actions";

// Only shortcuts for typing the name; any name works.
const SUGGESTIONS = ["GCash", "Maya", "MariBank QR Ph", "Bank transfer"];

export function AddMethodForm({ existing }: { existing: string[] }) {
  const [state, action, pending] = useActionState<AddMethodState, FormData>(addPaymentMethodAction, {});
  const [label, setLabel] = useState("");
  const uid = useId();
  const formRef = useFocusFirstError(state);
  const taken = new Set(existing.map((name) => name.toLowerCase()));
  const suggestions = SUGGESTIONS.filter((name) => !taken.has(name.toLowerCase()));

  return (
    <form ref={formRef} action={action} className="sheet flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${uid}-label`}>Add a payment method</Label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            id={`${uid}-label`}
            name="label"
            required
            maxLength={40}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="e.g. GCash, BPI, PayPal"
            autoComplete="off"
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? `${uid}-error` : undefined}
          />
          <Button type="submit" disabled={pending} className="sm:shrink-0">
            <Plus data-icon="inline-start" />
            {pending ? "Adding…" : "Add"}
          </Button>
        </div>
        {suggestions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2" aria-label="Suggestions">
            {suggestions.map((name) => (
              <button key={name} type="button" onClick={() => setLabel(name)} className="min-h-11 rounded-full bg-muted px-3 text-sm font-semibold text-foreground hover:bg-muted/70">
                {name}
              </button>
            ))}
          </div>
        ) : null}
        {state.error ? (
          <p id={`${uid}-error`} role="alert" className="text-sm font-semibold text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
