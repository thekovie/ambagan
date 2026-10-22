"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addGuestInlineAction, type AddGuestState } from "./actions";

export type AddedGuest = NonNullable<AddGuestState["guest"]>;

/**
 * Adds a friend who has no account, without leaving the builder. It is a separate form (not nested inside the
 * builder's), and hands the new person back so they are put in the split straight away.
 */
export function GuestForm({ onAdded }: { onAdded?: (guest: AddedGuest) => void }) {
  const [state, action, pending] = useActionState<AddGuestState, FormData>(addGuestInlineAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const seen = useRef<AddedGuest | undefined>(undefined);

  // Each successful result is announced to the builder exactly once.
  useEffect(() => {
    if (state.guest && state.guest !== seen.current) {
      seen.current = state.guest;
      onAdded?.(state.guest);
      formRef.current?.reset();
    }
  }, [state.guest, onAdded]);

  return (
    <details className="rounded-2xl border-2 border-dashed border-input p-4 [&[open]>summary]:mb-4">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
        <UserPlus className="size-4" aria-hidden="true" />
        Add a friend who has no account
      </summary>
      <form ref={formRef} action={action} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          They get a private link to see their share and report their payment, no sign-up needed. An email is optional: with one, they also get reminders.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="guest-name">Name</Label>
            <Input id="guest-name" name="name" autoComplete="off" required placeholder="Tito Boy" defaultValue={state.values?.name} aria-invalid={state.errorField === "name" ? true : undefined} aria-describedby={state.errorField === "name" ? "guest-error" : undefined} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="guest-email">Email (optional, to email them their share)</Label>
            <Input id="guest-email" name="email" type="email" inputMode="email" autoComplete="off" placeholder="name@example.com" defaultValue={state.values?.email} aria-invalid={state.errorField === "email" ? true : undefined} aria-describedby={state.errorField === "email" ? "guest-error" : undefined} />
          </div>
        </div>
        {state.error ? (
          <p id="guest-error" role="alert" className="text-sm font-semibold text-destructive">
            {state.error}
          </p>
        ) : null}
        <div>
          <Button type="submit" variant="secondary" disabled={pending}>
            <UserPlus data-icon="inline-start" /> {pending ? "Adding…" : "Add friend"}
          </Button>
        </div>
      </form>
    </details>
  );
}
