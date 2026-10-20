"use client";

import { useActionState } from "react";
import { CopyField } from "@/components/copy-field";
import { GuestForm } from "../ambag/guest-form";
import { promoteGuestAction, type MemberActionState } from "./actions";
import { MemberRow, type MemberView } from "./member-row";

/**
 * The guests list. It owns "Invite to join" (rather than each row) because a promoted guest becomes a member and
 * their row moves to the Members list: the result ("invitation emailed", or the link to share when email failed)
 * has to live here, in a component that stays put, or it would vanish with the row.
 */
export function GuestsSection({ guests }: { guests: MemberView[] }) {
  const [state, action, pending] = useActionState<MemberActionState, FormData>(promoteGuestAction, {});

  return (
    <section aria-labelledby="guests" className="flex flex-col gap-4">
      <h2 id="guests" className="font-display text-title">
        Friends without an account ({guests.length})
      </h2>
      <p className="max-w-2xl text-muted-foreground">
        Guests don&apos;t sign in. They get a private link for each ambag to see their share and report their payment. Invite one to join if they&apos;d like an account.
      </p>

      {/* Always mounted so the result is announced when it appears. */}
      <div role="status" aria-live="polite">
        {state.invite ? (
          <div className="flex flex-col gap-2 rounded-xl bg-secondary p-4">
            <p className="text-sm font-bold">
              {state.invite.emailSent ? `Invitation emailed to ${state.invite.email}. They're a member now.` : "Couldn't send the email. Share this link instead:"}
            </p>
            {state.invite.emailSent ? null : <CopyField value={state.invite.url} label={`Invitation link for ${state.invite.email}`} />}
          </div>
        ) : null}
      </div>
      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}

      {guests.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {guests.map((guest) => (
            <MemberRow key={guest.id} member={{ ...guest, isSelf: false }} promote={{ action, pending }} />
          ))}
        </ul>
      ) : null}
      <GuestForm />
    </section>
  );
}
