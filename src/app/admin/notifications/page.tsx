import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import { EmailPill } from "@/components/email-pill";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDateTime } from "@/lib/dates";
import { EMAIL_STATUSES, type EmailStatus } from "@/lib/enums";
import { requireAdmin } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { emailCounts, listEmails } from "@/server/email/queue";
import { EmailTools, ResendButton } from "./email-controls";

export const metadata: Metadata = { title: "Emails" };

const LIST_LIMIT = 50;
const TYPE_LABELS: Record<string, string> = {
  INVITATION: "Invitation",
  LOGIN: "Sign-in link",
  SOA_GENERATED: "New statement",
  DUE_TOMORROW: "Due tomorrow",
  DUE_TODAY: "Due today",
  OVERDUE: "Overdue",
  PAYMENT_RECEIVED: "Payment reported",
  ADMIN_VERIFY_REQUEST: "Verify request",
  PAYMENT_APPROVED: "Payment approved",
  PAYMENT_DECLINED: "Payment declined",
  TEST: "Test",
};
const STATUS_LABELS: Record<EmailStatus, string> = { PENDING: "Waiting", SENDING: "Sending", SENT: "Sent", FAILED: "Failed" };

/** The sign-in link and invitation are one-time secrets that are never stored, so they can't be resent. */
const canResend = (type: string, status: string) =>
  type !== "LOGIN" && type !== "INVITATION" && (status === "SENT" || status === "FAILED");

export default async function AdminNotificationsPage({ searchParams }: PageProps<"/admin/notifications">) {
  await requireAdmin();
  const params = await searchParams;
  const db = getDb();
  const status = EMAIL_STATUSES.find((s) => s === params.status);
  const counts = emailCounts(db);
  const rows = listEmails(db, { status, limit: LIST_LIMIT });

  return (
    <div className="flex flex-col gap-12">
      <header className="max-w-2xl">
        <h1 className="font-display text-5xl md:text-6xl">Emails</h1>
        <p className="mt-3 text-muted-foreground">
          Everything ambagan emails is listed here. <strong>Sent</strong> means the mail server accepted it; email can&apos;t
          confirm that it reached the inbox. Failed messages are retried a few times before we give up.
        </p>
      </header>

      <section aria-label="Email totals">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {EMAIL_STATUSES.map((s) => (
            <div key={s} className="rounded-xl bg-secondary p-4">
              <dt className="text-sm font-semibold text-muted-foreground">{STATUS_LABELS[s]}</dt>
              <dd className="font-display text-4xl">{counts[s]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="tools" className="flex flex-col gap-4">
        <h2 id="tools" className="font-display text-3xl">
          Check email works
        </h2>
        <EmailTools />
      </section>

      <section aria-labelledby="log" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="log" className="font-display text-3xl">
            Recent emails
          </h2>
          <form className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="status">Show</Label>
              <NativeSelect id="status" name="status" defaultValue={status ?? ""}>
                <option value="">Everything</option>
                {EMAIL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button type="submit" variant="secondary" size="sm">
              Filter
            </Button>
          </form>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<MailCheck />}
            title="No emails yet"
            description="Invitations, statements and payment updates show up here as they are sent."
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-bold">
                    {TYPE_LABELS[row.type] ?? row.type} <span className="font-normal text-muted-foreground">to</span>{" "}
                    {row.toEmail}
                  </p>
                  <EmailPill status={row.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {row.subject} · queued {formatDateTime(row.createdAt)}
                  {row.sentAt ? ` · sent ${formatDateTime(row.sentAt)}` : ""}
                  {row.attempts > 1 || row.status === "FAILED" ? ` · ${row.attempts} attempt${row.attempts === 1 ? "" : "s"}` : ""}
                </p>
                {row.lastError ? <p className="text-sm text-destructive">Last error: {row.lastError}</p> : null}
                {canResend(row.type, row.status) ? (
                  <ResendButton emailId={row.id} label={`${row.subject} to ${row.toEmail}`} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
