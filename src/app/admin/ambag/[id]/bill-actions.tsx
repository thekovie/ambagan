"use client";

import { Check, Copy, Link2, Mail, MessageSquareText, TriangleAlert } from "lucide-react";
import { useActionState, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/copy-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addGuestEmailAction, cancelBillAction, replaceLinkAction, sendRequestAction, type CancelBillState, type RequestState } from "../actions";

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard blocked (typical on a plain-http home server): the caller shows the text in a field to copy by hand.
      setCopied("failed");
      return;
    }
    setCopied(key);
    setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000);
  }
  return { copied, copy };
}

interface ShareActionsProps {
  billId: string;
  statementId: string;
  name: string;
  url: string;
  /** A ready-to-send chat message that includes the link. */
  message: string;
  /** Only while the share is still unpaid: a settled or cancelled share has nothing left to send. */
  open: boolean;
  userId: string;
  /** Their real email, or null for a friend who has none (guests may start without one). */
  email: string | null;
  isGuest: boolean;
}

/** Copy this person's link or a ready-made chat message, or replace the link if it went to the wrong chat. */
export function ShareActions({ billId, statementId, name, url, message, open, userId, email, isGuest }: ShareActionsProps) {
  const { copied, copy } = useCopy();
  const [state, replace] = useActionState<CancelBillState, FormData>(replaceLinkAction, {});

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant={open ? "secondary" : "ghost"} onClick={() => copy("link", url)}>
        {copied === "link" ? <Check data-icon="inline-start" /> : <Link2 data-icon="inline-start" />}
        {copied === "link" ? "Copied" : "Copy link"}
        <span className="sr-only"> for {name}</span>
      </Button>
      <Button type="button" size="sm" variant={open ? "secondary" : "ghost"} onClick={() => copy("message", message)}>
        {copied === "message" ? <Check data-icon="inline-start" /> : <MessageSquareText data-icon="inline-start" />}
        {copied === "message" ? "Copied" : "Copy message"}
        <span className="sr-only"> for {name}</span>
      </Button>
      <form action={replace}>
        <input type="hidden" name="billId" value={billId} />
        <input type="hidden" name="statementId" value={statementId} />
        <ConfirmButton size="sm" variant="ghost" confirmLabel={<>Sure? The old link stops working<span className="sr-only"> for {name}</span></>}>
          <Copy data-icon="inline-start" />
          New link<span className="sr-only"> for {name}</span>
        </ConfirmButton>
      </form>
      <span role="status" className="sr-only">
        {copied === "link" ? `Link for ${name} copied` : copied === "message" ? `Message for ${name} copied` : copied === "failed" ? "Couldn't copy automatically. The link and message are shown below to copy by hand." : ""}
      </span>
      {copied === "failed" ? (
        <div className="flex w-full flex-col gap-2 rounded-xl bg-secondary p-3">
          <p className="text-sm font-bold">Your browser blocked copying. Select and copy it here instead:</p>
          <CopyField value={url} label={`Link for ${name}`} />
          <CopyField value={message} label={`Message for ${name}`} />
        </div>
      ) : null}
      {state.error ? (
        <p role="alert" className="w-full text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}
      {open ? <RequestControls billId={billId} statementId={statementId} name={name} userId={userId} email={email} isGuest={isGuest} /> : null}
    </div>
  );
}

/**
 * Email this person their payment request now. A friend with an email gets one button; a guest with none gets a small
 * form to add an address (they stay a guest) and the request goes out in the same step.
 */
function RequestControls({ billId, statementId, name, userId, email, isGuest }: { billId: string; statementId: string; name: string; userId: string; email: string | null; isGuest: boolean }) {
  const [sent, sendAction, sending] = useActionState<RequestState, FormData>(sendRequestAction, {});
  const [added, addAction, adding] = useActionState<RequestState, FormData>(addGuestEmailAction, {});
  const result = added.message || added.error ? added : sent;

  return (
    <div className="flex w-full flex-col gap-2">
      {email ? (
        <form action={sendAction}>
          <input type="hidden" name="statementId" value={statementId} />
          <Button type="submit" size="sm" variant="secondary" disabled={sending}>
            <Mail data-icon="inline-start" />
            {sending ? "Sending…" : "Email request"}
            <span className="sr-only"> to {name}</span>
          </Button>
        </form>
      ) : isGuest ? (
        <details className="[&[open]>summary]:mb-2">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold underline underline-offset-4">
            <Mail className="size-4" aria-hidden="true" /> Add their email to send this by email
            <span className="sr-only"> for {name}</span>
          </summary>
          <form action={addAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="billId" value={billId} />
            <input type="hidden" name="statementId" value={statementId} />
            <input type="hidden" name="userId" value={userId} />
            <Input name="email" type="email" inputMode="email" autoComplete="off" required placeholder="name@example.com" aria-label={`Email for ${name}`} className="h-10 w-64" />
            <Button type="submit" size="sm" variant="secondary" disabled={adding}>
              {adding ? "Sending…" : "Save and email"}
            </Button>
          </form>
        </details>
      ) : null}
      <div role="status" aria-live="polite" className="text-sm font-semibold empty:hidden">
        {result.message ?? null}
      </div>
      {result.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {result.error}
        </p>
      ) : null}
    </div>
  );
}

/** Cancels the whole ambag, with a reason. Refused (and says why) if anyone has paid or reported paying. */
export function CancelBillForm({ billId }: { billId: string }) {
  const [state, action] = useActionState<CancelBillState, FormData>(cancelBillAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="billId" value={billId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="cancel-reason">Why are you cancelling it?</Label>
        <Input id="cancel-reason" name="reason" required minLength={3} maxLength={200} autoComplete="off" placeholder="Wrong total, will redo it" aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? "cancel-error" : undefined} />
      </div>
      {state.error ? (
        <p id="cancel-error" role="alert" className="flex items-start gap-2 text-sm font-semibold text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}
      <div>
        <ConfirmButton variant="destructive" size="sm" confirmLabel="Sure? Cancel this ambag">
          Cancel this ambag
        </ConfirmButton>
      </div>
    </form>
  );
}
