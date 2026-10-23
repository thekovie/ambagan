"use client";

import { useActionState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { removeLateFeeAction, waivePenaltyAction, type PenaltyState } from "./actions";

function Problem({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-sm font-semibold text-destructive">
      {message}
    </p>
  ) : null;
}

/** Excuses a penalty that is still building up (two taps: it cannot be undone). */
export function WaivePenalty({ penaltyId, who }: { penaltyId: string; who: string }) {
  const [state, action] = useActionState<PenaltyState, FormData>(waivePenaltyAction, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="penaltyId" value={penaltyId} />
      <ConfirmButton variant="secondary" size="sm" confirmLabel="Sure? Waive it">
        Waive <span className="sr-only">the late fee for {who}</span>
      </ConfirmButton>
      <Problem message={state.error} />
    </form>
  );
}

/** Takes the late fees off an unpaid statement that already carries them. */
export function RemoveLateFee({ statementId, reference }: { statementId: string; reference: string }) {
  const [state, action] = useActionState<PenaltyState, FormData>(removeLateFeeAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="statementId" value={statementId} />
      <ConfirmButton variant="secondary" size="sm" confirmLabel="Sure? Remove the late fees">
        Remove late fees <span className="sr-only">from {reference}</span>
      </ConfirmButton>
      <Problem message={state.error} />
    </form>
  );
}
