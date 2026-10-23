"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { deletePaymentMethodAction, type DeleteMethodState } from "./actions";

/** Deleting asks twice. A method that past payments point to can only be switched off, and says so instead of offering the button. */
export function DeleteMethodForm({ id, label, canDelete }: { id: string; label: string; canDelete: boolean }) {
  const [state, action, pending] = useActionState<DeleteMethodState, FormData>(deletePaymentMethodAction, {});
  const [confirming, setConfirming] = useState(false);

  if (!canDelete) {
    return <p className="text-sm text-muted-foreground">Payments have been made to {label}, so it can&apos;t be deleted. Switch it off to hide it from members.</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold">Delete {label} for good?</span>
          <Button type="submit" variant="destructive" disabled={pending}>
            <Trash2 data-icon="inline-start" />
            {pending ? "Deleting…" : "Yes, delete"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <div>
          <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>
            <Trash2 data-icon="inline-start" />
            Delete {label}
          </Button>
        </div>
      )}
      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
