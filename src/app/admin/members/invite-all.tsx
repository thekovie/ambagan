"use client";

import { MailPlus } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inviteAllAction, type InviteAllState } from "./actions";

/** One button to invite everyone who has not been invited yet, instead of "Send invite" on each row. */
export function InviteAll({ count }: { count: number }) {
  const [state, action, pending] = useActionState<InviteAllState, FormData>(inviteAllAction, {});

  return (
    <div className="flex flex-col gap-2">
      {count > 0 ? (
        <form action={action}>
          <Button type="submit" variant="secondary" disabled={pending}>
            <MailPlus data-icon="inline-start" />
            {pending ? "Sending…" : `Invite the ${count} not invited yet`}
          </Button>
        </form>
      ) : null}
      {/* Always mounted so the result is announced when it appears. */}
      <div role="status" aria-live="polite" className="text-sm font-semibold empty:hidden">
        {state.sent !== undefined && state.sent > 0 ? `Invitations emailed to ${state.sent} ${state.sent === 1 ? "friend" : "friends"}.` : null}
        {state.failed && state.failed.length > 0
          ? ` Couldn't email ${state.failed.join(", ")}: use "Send invite" on their row to get a link to share.`
          : null}
      </div>
    </div>
  );
}
