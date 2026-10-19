"use client";

import { Check } from "lucide-react";
import { useActionState, useId } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { approvePaymentAction, declinePaymentAction, type ReviewState } from "./actions";

interface ReviewActionsProps {
  paymentId: string;
  memberName: string;
  /** When the amounts differ the admin must write why they are accepting it. */
  amountMatches: boolean;
}

/** Approve (after checking the receiving account) or decline with a reason. Both need a second press. */
export function ReviewActions({ paymentId, memberName, amountMatches }: ReviewActionsProps) {
  const [approve, approveAction] = useActionState<ReviewState, FormData>(approvePaymentAction, {});
  const [decline, declineAction] = useActionState<ReviewState, FormData>(declinePaymentAction, {});
  const uid = useId();

  return (
    <div className="flex flex-col gap-4">
      <form action={approveAction} className="flex flex-col gap-3">
        <input type="hidden" name="paymentId" value={paymentId} />
        {amountMatches ? null : (
          <div className="flex max-w-md flex-col gap-2">
            <Label htmlFor={`${uid}-adjustment`}>Why accept a different amount?</Label>
            <Input
              id={`${uid}-adjustment`}
              name="adjustmentNote"
              required
              minLength={3}
              maxLength={200}
              autoComplete="off"
              placeholder="e.g. Agreed to waive the difference"
              aria-describedby={`${uid}-adjustment-hint`}
            />
            <p id={`${uid}-adjustment-hint`} className="text-sm text-muted-foreground">
              The statement is marked paid in full and this note is kept with the payment.
            </p>
          </div>
        )}
        {approve.error ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {approve.error}
          </p>
        ) : null}
        <div>
          <ConfirmButton
            confirmLabel={
              <>
                Sure? Mark paid<span className="sr-only"> for {memberName}</span>
              </>
            }
          >
            <Check data-icon="inline-start" />
            Money arrived: approve
            <span className="sr-only"> for {memberName}</span>
          </ConfirmButton>
        </div>
      </form>

      <details>
        <summary className="cursor-pointer text-sm font-semibold underline underline-offset-4 marker:hidden">
          Couldn&apos;t find it? Decline<span className="sr-only"> payment from {memberName}</span>
        </summary>
        <form action={declineAction} className="mt-3 flex max-w-md flex-col gap-3 rounded-xl bg-secondary p-4">
          <input type="hidden" name="paymentId" value={paymentId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${uid}-reason`}>Reason (the member sees this)</Label>
            <Input
              id={`${uid}-reason`}
              name="reason"
              required
              minLength={3}
              maxLength={300}
              autoComplete="off"
              placeholder="e.g. I can't see this transfer in my GCash"
              aria-invalid={decline.error ? true : undefined}
              aria-describedby={decline.error ? `${uid}-reason-error` : undefined}
            />
          </div>
          {decline.error ? (
            <p id={`${uid}-reason-error`} role="alert" className="text-sm font-semibold text-destructive">
              {decline.error}
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Their report stays on record. They can send corrected details, and the reference becomes usable again.
          </p>
          <div>
            <ConfirmButton variant="destructive" size="sm" confirmLabel="Sure? Decline">
              Decline payment
            </ConfirmButton>
          </div>
        </form>
      </details>
    </div>
  );
}
