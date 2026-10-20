# ambagan

*Split it, settle it.* A small self-hosted payment portal for a shared subscription (Spotify first) among friends. Everyone gets a monthly **statement of account**; members **pay outside the app** (GCash, Maya or MariBank), **report the payment** (optionally by scanning the receipt in their browser), and the admin **verifies it against the receiving account** before the statement is marked paid. Reminders go out by email. No payment is ever processed here and no receipt image is ever uploaded or stored.

Stack: Next.js 16 (App Router), TypeScript, Tailwind, shadcn/ui, SQLite + Drizzle, Auth.js (passwordless email links), Nodemailer + React Email, Tesseract.js, Docker Compose.

## How it works

1. The admin **invites** members by email (invitation-only; sign-in is a one-time emailed link, no passwords).
2. Each month (Asia/Manila), from the plan's issue day (default the 1st), every active member gets a **statement** (default PHP 50.00, due on the 10th) and an email. Someone who joins after the due day starts next month.
3. The member opens the statement, taps **Submit payment**, pays the admin's GCash/Maya/MariBank account in their own app, then reports it: reference number, amount, time, and which app they paid from. **Scan receipt** reads these from a screenshot *inside the browser*; the member checks every field and only those fields are sent.
4. The statement shows **Waiting for check**. The admin sees what was owed against what was claimed, finds the transaction in their own account, and **approves or declines** (a decline needs a reason; the member can report again). Only an admin's approval marks a statement paid.
5. Everyone is emailed at each step, and reminders (the day before, the day of, weekly once overdue) go only to people who still owe.

Admins also manage plans and fees, payment accounts and QR codes, statements (issue, cancel), the email log, the daily run and backups.

## Run it with Docker

```bash
cp .env.example .env     # set AUTH_SECRET (openssl rand -base64 32), ADMIN_EMAIL, APP_URL and SMTP_*
docker compose up -d --build
docker compose ps        # wait for "healthy"
```

Open the app and sign in with `ADMIN_EMAIL`: that address becomes the first administrator. One container, one volume, no other services (about 50 MiB of memory at idle). Put a TLS reverse proxy in front for real use.

- **SMTP is required in production.** Use any provider's SMTP details; after starting, press **Admin → Emails → Send me a test email**. See [docs/email.md](docs/email.md).
- **Backups run daily by themselves** and `scripts/restore.sh` restores one. Copy them off the machine: see [docs/backup-restore.md](docs/backup-restore.md).
- The container refuses to start (exit code 1, reason in `docker compose logs`) if configuration is missing or invalid.

## Development

```bash
nvm use                  # Node 22
pnpm install
cp .env.example .env     # fill AUTH_SECRET and ADMIN_EMAIL; without SMTP, emails are printed to the console
pnpm dev
```

| Command | What |
|---|---|
| `pnpm typecheck` / `pnpm lint` | types and lint |
| `pnpm test` | 433 unit and integration tests (real SQLite, real migrations) |
| `pnpm e2e` | the full journey in a real browser against the production build (first: `pnpm exec playwright install chromium`) |
| `pnpm build` | production build (also copies the OCR engine into `public/ocr`) |
| `pnpm db:generate` | create a migration after editing `src/server/db/schema.ts` |

## What runs on its own

A one-minute timer inside the app: after 08:00 Manila time it takes the **daily backup**, then runs the **daily job** (issues the month's statements, marks late ones overdue, queues reminders), each at most once per day with catch-up after downtime; and it sends any email that is due or waiting to retry. Details in [docs/billing.md](docs/billing.md#scheduled-jobs-the-daily-run) and [docs/email.md](docs/email.md). Admins can run both by hand from the Statements and Settings pages.

## Documentation

| | |
|---|---|
| [docs/architecture.md](docs/architecture.md) | how it fits together, conventions, the payment journey |
| [docs/database.md](docs/database.md) | tables, the rules the database enforces, migrations |
| [docs/authentication.md](docs/authentication.md) | invitation-only sign-in, sessions, roles, rate limiting |
| [docs/billing.md](docs/billing.md) | statements, statuses, cancellation, the daily run |
| [docs/payments.md](docs/payments.md) | reporting and verifying a payment |
| [docs/ocr.md](docs/ocr.md) | in-browser receipt scanning and its limits |
| [docs/email.md](docs/email.md) | SMTP setup, the queue, what is sent |
| [docs/deployment.md](docs/deployment.md) | Docker, reverse proxy, security headers, updating, troubleshooting |
| [docs/backup-restore.md](docs/backup-restore.md) | daily backups, off-machine copies, restoring |
| [docs/testing.md](docs/testing.md) | test layers, coverage, what is not covered |
| [PROJECT_LOG.md](PROJECT_LOG.md) | every decision, issue and deviation, with the reasoning |
| [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md) | who it is for and the visual system |

## Troubleshooting

The quick answers are in [docs/deployment.md](docs/deployment.md#troubleshooting). The usual suspects: a wrong `APP_URL` (links in emails point to the wrong place), SMTP not working (the **Emails** page shows the error), or a reverse proxy that doesn't forward `X-Forwarded-For` or allows less than 2 MB request bodies.

## Known limitations

- **Receipt scanning has only been tested on synthetic receipts.** Accuracy on real GCash, Maya and MariBank screenshots is unmeasured, which is why every field is shown for the member to confirm. It can be skipped entirely.
- **Payments are whole-statement.** A different amount is only accepted if the admin records why (treating it as settled in full); there are no partial payments or allocations.
- **Verification is manual by design.** There is no bank or wallet integration, and no receipt is stored, so the admin's own account is the evidence.
- Email was verified against a local TLS SMTP server, not yet a hosted provider. Delivery to an inbox can't be confirmed: "Sent" means the mail server accepted it.
- Only the current Manila month is issued automatically; if the app was down for a plan's whole issue-day-to-month-end window, use **Generate missing** by hand.
- An admin who is also a member can approve their own payment (every approval is audited).
- No PDF export (use the browser's print); backups are daily, so up to a day of changes can be lost; Auth.js v5 is still a beta release.
- Verified on arm64 locally; CI builds and smoke-tests the image on amd64.
