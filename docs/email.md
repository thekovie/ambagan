# Email

ambagan sends email over plain SMTP (Nodemailer). Anything that is not a one-time secret goes through a **queue in SQLite** (`email_log`), so a mail outage can never undo or block a payment, a statement or an approval.

## Setting up SMTP

Set these in the environment (see `.env.example`):

| Variable | Notes |
|---|---|
| `SMTP_HOST`, `SMTP_PORT` | Your provider's server. Default port 587. |
| `SMTP_SECURE` | `true` for implicit TLS (port 465). `false` for STARTTLS (587): the connection **must** upgrade to TLS or the send fails; there is no plaintext fallback. |
| `SMTP_USER`, `SMTP_PASSWORD` | Optional, for authenticated servers. |
| `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `SMTP_REPLY_TO` | Sender identity. Use an address your provider allows. |

In production `SMTP_HOST` and `SMTP_FROM_EMAIL` are required and the app refuses to start without them. In development without SMTP, messages are printed to the server console instead.

After deploying, open **Admin → Emails** and press **Send me a test email**. It goes to your own address immediately and shows exactly what the mail server answered, so a wrong password or blocked port shows up there.

## What is sent

| Type | To | Sent when |
|---|---|---|
| `SOA_GENERATED` | member | a new statement is issued (the daily job, see billing.md) |
| `DUE_TOMORROW`, `DUE_TODAY`, `OVERDUE` | member | reminders, never for paid or under-verification statements (the daily job, see billing.md) |
| `PAYMENT_RECEIVED` | member | they reported a payment |
| `ADMIN_VERIFY_REQUEST` | every active admin | a payment needs checking |
| `PAYMENT_APPROVED`, `PAYMENT_DECLINED` | member | the admin decided (a decline includes the reason) |
| `TEST` | the admin | the test button |
| `LOGIN`, `INVITATION` | the person | sent **directly**, see below |

Deactivated members are not emailed. Payment notifications are written to the queue **inside the same database transaction** as the payment change: if the change rolls back there is no email, and if the mail server is down the change still stands.

## The queue

`email_log` rows move `PENDING → SENDING → SENT`, or back to `PENDING` with a delay after a failure, or to `FAILED` once attempts run out.

- **Dedupe:** every message has a unique `dedupe_key` such as `PAYMENT_APPROVED:<paymentId>`. Queuing the same event twice (a double-click, a re-run of a job) is silently ignored.
- **Claiming:** a send run takes due messages in one immediate transaction and marks them `SENDING` with a 10-minute lease. Two runs can never take the same message. If the process dies mid-send, the message becomes claimable again when the lease expires.
- **Timeouts:** SMTP connect, greeting and socket time out after 15 s, so an unreachable server fails fast.
- **Crashes:** a message claimed 5 times without ever finishing (the process kept dying while sending it) is marked `FAILED` rather than retried forever.
- **Retries:** up to 5 attempts in total, waiting 1 min, 5 min, 30 min and 2 h between them. The last error (truncated to 500 characters) is kept on the row.
- **SENT means accepted by your SMTP server.** Email gives no delivery receipts, so ambagan never says "delivered".
- **Payload:** the template inputs are stored as pre-formatted strings (`"₱75.50"`, `"October 2026"`) plus an app-relative link; the message is rendered when it is sent, and links are built from `APP_URL`. No receipt data, OCR text or secrets are ever in a payload.
- **Resend:** from the admin page, a sent or failed notification can be queued again as a new row; the original stays as history.
- **Send waiting emails now:** makes retry-waiting messages due immediately and sends everything, handy right after fixing SMTP settings.

## Sign-in and invitation mail

These carry one-time links, so they are **not** put in the queue (the database would otherwise hold a working link until it was sent). They are sent directly: the admin sees at once whether an invitation went out and can share the link by hand if it didn't. The log records that they were sent or failed, never the link, and they can't be resent from the log (send a new invitation instead).

## Templates

Notification emails are React Email components (`src/server/email/notification-email.tsx`) driven by one copy table (`notification-copy.ts`), rendered to HTML and plain text. All values are escaped by React. Sign-in and invitation mail use small hand-written HTML (`auth-templates.ts`) because they predate the queue and need nothing dynamic. Styling is inline with hex colours, since email clients ignore external CSS.

## Known limits

- Real SMTP delivery was verified against a local TLS SMTP sink only, not a hosted provider.
- Finished `email_log` rows are pruned after 90 days by the daily job (they hold addresses, subjects and decline reasons).
- Retries happen when something triggers a send run (an action, the admin button, and the one-minute scheduler tick).
