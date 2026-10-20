# Architecture

ambagan is one Next.js application that runs as **one process in one container**. The web app, the scheduler, the email sender and the backup job all live in that process; the only storage is a SQLite file and a folder of QR images on one volume.

```
                 browser                                    server process (Node 22, one container)
   ┌─────────────────────────────┐            ┌──────────────────────────────────────────────────────────┐
   │ pages (React 19, Tailwind)  │  HTTPS     │ src/proxy.ts      CSP nonce + sign-in redirect shortcut   │
   │ receipt OCR: Tesseract.js   │ ◄────────► │ src/app/**        pages, layouts, server actions, routes  │
   │   in a Web Worker + WASM    │ (via TLS   │ src/server/**     domain logic (the only place rules live)│
   │   (image never leaves the   │  reverse   │ src/instrumentation-node.ts  starts the scheduler         │
   │    browser)                 │  proxy)    │                                                          │
   └─────────────────────────────┘            │   one-minute tick:  daily backup → daily job → mail queue │
                                              └───────────────┬───────────────────────┬──────────────────┘
                                                              │                       │
                                                   SQLite (WAL) on /data      SMTP server (yours)
                                                   QR images on /data/assets
```

## Layers and where things live

| Layer | Where | Rule |
|---|---|---|
| Routes and UI | `src/app/**` | Thin. Pages read through domain functions; server actions validate input, re-check who the caller is, call a domain function, then revalidate. |
| Domain logic | `src/server/<area>/` | All business rules and all database access. Plain functions taking a `db` handle, so they run in tests against an in-memory SQLite with the real migrations. |
| Pure helpers | `src/lib/` | Money, dates, statuses, enums, OCR parsers, CSP, name cleaning. No database or secrets, safe for client bundles (`statement-view.ts` imports the pure period helpers from `server/billing/period`). |
| Schema | `src/server/db/schema.ts` + `drizzle/` | One source of truth; migrations are generated and applied at startup. |

Server areas: `auth` (sessions, invitations, roles, rate limiting), `billing` (periods, generation, statements, dashboards), `payments` (methods, submission, verification, history), `members`, `subscriptions`, `email` (queue, templates, worker), `jobs` (runner, daily job, scheduler), `backup`, `assets` (QR image storage), `audit`.

## Conventions that hold everywhere

- **Money is an integer number of centavos.** Parsing and formatting live in `src/lib/money.ts`; there is no floating-point money.
- **Time is Asia/Manila (UTC+8, no daylight saving).** Billing periods are `"YYYY-MM"` strings; due dates are the last millisecond of the due day; "today" is always the Manila calendar day.
- **Statements are snapshots.** Plan name, amount and currency are copied onto the statement when it is issued; later fee changes never touch it.
- **Authorization is checked on the server at every layer** and never trusted from the client: `proxy.ts` only redirects visitors with no session cookie (a UX shortcut); layouts and pages call `requireUser()` / `requireAdmin()`; every server action repeats it; ownership is part of the query (someone else's statement is simply "not found"); the approval domain function re-checks that the actor is an active admin.
- **Invariants live in the database where possible:** one pending payment per statement, a reference used once among non-declined payments, one statement per member, plan and month (partial unique indexes), so races and double-clicks can't break them.
- **Every state change that matters is one transaction** (better-sqlite3; the money-critical ones, submission, approval, decline, generation and the job runner, use `immediate` mode): validate, change, write the audit entry, and queue the notification email together.

## The payment journey

```
 member                          server                                  admin
   │ view statement ───────────►  getStatementForUser (ownership in query)
   │ scan receipt (browser only)
   │ confirm fields, submit ───►  submitPayment: PENDING payment, statement → UNDER_VERIFICATION,
   │                              audit, queue emails (member + admins)        (one transaction)
   │                                                                  ◄── sees it in /admin/payments
   │                              approvePayment / declinePayment ◄──── checks the receiving account
   │                              APPROVED + statement PAID + balance 0 + audit + email   (one transaction)
   │                              or DECLINED + reason, statement → UNPAID/OVERDUE, member can report again
```

Submitting never marks anything paid; only an admin's approval does. No receipt image and no raw OCR text is ever sent to the server, logged or stored: the browser reads the image, and only the fields the member confirmed are submitted.

## Background work

One timer (`unref`'d, started from `instrumentation-node.ts` on the Node runtime only) ticks every minute. On each tick: after 08:00 Manila, run the daily backup and then the daily job (each recorded in `job_run`, so each happens once per Manila day, with catch-up after downtime); then send any email that is due. Email never blocks or rolls back billing: messages are written to `email_log` in the same transaction as the change, and a separate step sends them with retries.

## Process lifecycle

At startup `instrumentation-node.ts` validates the environment and opens the database (applying migrations and seeding the default plan and payment methods); on failure it logs the reason and exits with code 1. On shutdown Next drains requests and an exit hook folds the WAL into the database file.

## Why these choices

The rationale, alternatives considered and issues met along the way are recorded decision by decision in [PROJECT_LOG.md](../PROJECT_LOG.md). The short version: one container with SQLite because the group is a handful of people and operations should be boring; a database-backed queue and scheduler instead of external services; and doing receipt OCR in the browser so a screenshot (which can show balances and other accounts) never has to be uploaded or stored.
