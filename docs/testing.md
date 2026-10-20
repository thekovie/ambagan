# Testing

Three layers, from fast and many to slow and few, plus manual drills for the things automation can't reasonably reach.

| Layer | What | Command | Size |
|---|---|---|---|
| Unit and integration | Domain logic against a real SQLite, parsers, helpers | `pnpm test` | 433 tests, about 3 s |
| End to end | The whole payment journey in a real browser against the production build | `pnpm e2e` | 1 journey, about 15 s |
| Drills | Docker, backup/restore, shutdown, bad config | by hand, logged in PROJECT_LOG.md | n/a |

Before merging, every change runs `pnpm typecheck && pnpm lint && pnpm test && pnpm build`; CI runs those plus the Docker smoke test and the e2e journey.

## Unit and integration tests (`tests/`, `src/env.test.ts`)

- They exercise the **domain functions against a real in-memory SQLite database with the real migrations** (`createTestDb()`), not mocks. That means the unique indexes, foreign keys and transactions that protect the invariants are the ones being tested.
- Time is always passed in (`now` parameters), never read from the clock, so Manila boundaries (month end, due-day end, the 08:00 run) are tested exactly.
- Tests are organised by area: billing, payments (submission and verification), OCR parsers and field application, email queue and notifications, scheduler and reminders, backup, auth domain, members and plans, payment methods and QR storage, health, CSP, dates and money.
- Each risky rule has negative cases: someone else's statement, a duplicate reference, a decline without a reason, a double approval, a deactivated member, an impossible date, a corrupt or truncated backup.
- The OCR parsers are tested against **synthetic** receipt text (`tests/fixtures/receipts.ts`) shaped like GCash, Maya and MariBank receipts. No real receipts are in the repository.

Coverage (`pnpm test:coverage`, over `src/server`, `src/lib` and `src/env.ts`): about 85% statements, 83% branches, 80% functions, 86% lines. The lower areas are code that needs the Next.js runtime or a running process (the auth configuration and session lookup, the database singleton, the scheduler's timer and the server-only wrappers); those are covered by the e2e journey and the Docker drills rather than by unit tests.

## End-to-end journey (`e2e/`)

One Playwright test follows the product from the admin's first sign-in to a confirmed payment: the admin signs in with an emailed link, enables a payment method and invites a member; the member accepts the invitation, signs in by email, sees the statement the admin issued, **scans a receipt** (drawn in the browser, read by the real OCR in a worker) and sends the payment; the admin and member are emailed; the admin approves; the member sees it paid and is emailed; the admin's email log shows nothing failed. It also fails if the browser reports any Content-Security-Policy violation.

It tests what ships: the production build started the way the Docker image starts it (the standalone server), against a fresh database, with a small local SMTP-over-TLS server (`e2e/smtp-sink.ts`) that captures what nodemailer actually sends. Sign-in and invitation links are read out of those captured emails, so the email path is exercised for real, without a mail provider.

First run needs the browser: `pnpm exec playwright install chromium`. Failure reports and traces land in `playwright-report/` and `test-results/` (CI uploads them).

## Manual drills (recorded in PROJECT_LOG.md)

Done in Docker and written up when they were run: container health, non-root and read-only filesystem, data persisting across container re-creation, bad configuration exiting with a clear error, graceful shutdown, the scheduler's first tick, backup from the admin page, **restore after deleting data** (including refusing a damaged backup, a backup from a newer version, and rolling back when the copy fails), outage and recovery of the mail server.

## Not covered, on purpose or for now

- Real receipts: OCR accuracy on actual GCash, Maya and MariBank screenshots is unmeasured (only synthetic receipts were used). See [ocr.md](ocr.md).
- A real SMTP provider (STARTTLS on port 587, provider authentication, spam placement): only the local TLS sink was used.
- Other browsers and phones: only Chromium; mobile and dark mode were checked by hand during design.
- amd64 containers locally (CI builds and smoke-tests the image on amd64).
- Behind a real TLS reverse proxy, and under sustained load.
