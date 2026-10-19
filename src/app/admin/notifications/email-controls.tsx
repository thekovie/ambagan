"use client";

import { Mail, RefreshCw, Send } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  resendEmailAction,
  sendQueuedNowAction,
  sendTestEmailAction,
  type EmailActionState,
} from "./actions";

function Result({ state }: { state: EmailActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm font-semibold text-destructive">
        {state.error}
      </p>
    );
  }
  return state.message ? (
    <p role="status" className="text-sm font-semibold">
      {state.message}
    </p>
  ) : null;
}

/** Two admin tools: prove SMTP works, and send whatever is waiting without waiting for the next run. */
export function EmailTools() {
  const [test, testAction, testPending] = useActionState<EmailActionState>(sendTestEmailAction, {});
  const [now, nowAction, nowPending] = useActionState<EmailActionState>(sendQueuedNowAction, {});

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <form action={testAction} className="flex flex-col items-start gap-3">
        <Button type="submit" disabled={testPending}>
          <Mail data-icon="inline-start" />
          {testPending ? "Sending…" : "Send me a test email"}
        </Button>
        <Result state={test} />
      </form>
      <form action={nowAction} className="flex flex-col items-start gap-3">
        <Button type="submit" variant="secondary" disabled={nowPending}>
          <Send data-icon="inline-start" />
          {nowPending ? "Sending…" : "Send waiting emails now"}
        </Button>
        <Result state={now} />
      </form>
    </div>
  );
}

export function ResendButton({ emailId, label }: { emailId: string; label: string }) {
  const [state, action, pending] = useActionState<EmailActionState, FormData>(resendEmailAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="emailId" value={emailId} />
      <Button type="submit" variant="outline" size="xs" disabled={pending}>
        <RefreshCw data-icon="inline-start" />
        Resend<span className="sr-only"> {label}</span>
      </Button>
      <Result state={state} />
    </form>
  );
}
