"use client";

import { useActionState, useId } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelStatementAction, type CancelState } from "./actions";

/** Disclosure with a required reason and a two-step confirm; the action writes an audit entry. */
export function CancelStatement({ statementId, reference }: { statementId: string; reference: string }) {
  const [state, action] = useActionState<CancelState, FormData>(cancelStatementAction, {});
  const uid = useId();

  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-semibold text-muted-foreground underline underline-offset-4 marker:hidden">
        Cancel <span className="sr-only">{reference}</span>
      </summary>
      <form action={action} className="mt-3 flex max-w-md flex-col gap-3 rounded-xl bg-secondary p-4">
        <input type="hidden" name="statementId" value={statementId} />
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-reason`}>Why is it being cancelled?</Label>
          <Input
            id={`${uid}-reason`}
            name="reason"
            required
            minLength={3}
            maxLength={200}
            autoComplete="off"
            placeholder="e.g. Left the group"
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? `${uid}-error` : undefined}
          />
        </div>
        {state.error ? (
          <p id={`${uid}-error`} role="alert" className="text-sm font-semibold text-destructive">
            {state.error}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          The member will no longer owe this statement. It stays in their history and can&apos;t be reissued. Only you
          and the audit log see this reason; the member just sees &ldquo;Cancelled by admin&rdquo;.
        </p>
        <div>
          <ConfirmButton variant="destructive" size="sm" confirmLabel="Sure? Cancel statement">
            Cancel statement
          </ConfirmButton>
        </div>
      </form>
    </details>
  );
}
