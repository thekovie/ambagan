# Database

SQLite (via `better-sqlite3`) with Drizzle ORM, one file on the `/data` volume. Opened in WAL mode with foreign keys on, `busy_timeout = 5000` and `synchronous = NORMAL`. Access is synchronous, which is what lets each domain operation be a short, truly atomic transaction.

## Conventions

| Thing | Representation |
|---|---|
| Ids | random UUID text (`crypto.randomUUID()`) |
| Timestamps | integer milliseconds since the epoch (UTC), mapped to `Date` by Drizzle |
| Money | integer centavos (`*_minor` columns), with a `currency` column ("PHP") |
| Billing period | text `"YYYY-MM"`, the Asia/Manila calendar month |
| Booleans | integer 0/1 |
| Enums | text, checked in TypeScript (`src/lib/enums.ts`) |

## Tables

**People and sign-in** (the first four follow the shape the Auth.js Drizzle adapter requires)

- `user`: email (unique), name, `role` (`MEMBER`/`ADMIN`), `is_active`.
- `account`: Auth.js provider links (unused for email sign-in, present for the adapter).
- `session`: database sessions. `sessionToken` is the cookie value. **Not included in backups.**
- `verificationToken`: pending sign-in links (hashed by Auth.js). **Not included in backups.**
- `invitation`: `token_hash` (only the hash is stored; the raw token lives in the emailed link), `expires_at`, `accepted_at`, `invited_by`.

**Billing**

- `subscription` (a plan): `name`, `ref_prefix` (unique), `fee_minor`, `currency`, `issue_day`, `due_day`, `payment_instructions`, `is_active`, and the late-penalty rule (`penalty_minor`, `penalty_every_days`, `penalty_cap_minor`, `penalty_since`). Seeded with Spotify, PHP 50.00, issue day 1, due day 10.
- `membership`: member in a plan, `start_period`, `is_active`. Unique per member and plan.
- `statement`: one per member, plan and period. Snapshots `subscription_name`, `amount_minor`, `currency`; `penalty_minor` (the part of `amount_minor` that is late fees carried over), `outstanding_minor`, `issued_at`, `due_at`, `status` (`UNPAID`, `UNDER_VERIFICATION`, `PAID`, `OVERDUE`, `CANCELLED`), cancellation fields, and a unique `reference` such as `SPOT-202610-K4M2Q8`.
- `penalty`: the late penalty of one monthly statement (unique `statement_id`): `amount_minor`, `late_days`, `applied_to_statement_id` (the later statement that carries it; null while it is still building up), `waived_at`. See [billing.md](billing.md).

**Payments**

- `payment_method`: whatever the admin adds (GCash, a bank, PayPal…); `kind` is a legacy tag ("CUSTOM" for new ones, nothing depends on it): label, account holder and number, instructions, `qr_file`/`qr_mime` (a file name inside the assets folder, served only through an authorized route), `is_active`.
- `payment`: a member's report. `destination_method_id` (where the money went) and `sending_app` (where it came from) are separate; `amount_minor`, `transaction_ref` and `transaction_ref_norm` (uppercase letters and digits only, for duplicate detection), `transaction_date`, `notes`, `status` (`PENDING`/`APPROVED`/`DECLINED`), `submitted_at`, `reviewed_by`/`reviewed_at`, `decline_reason`, `adjustment_note`. Rows are never deleted: a decline keeps the original submission.

**Operations**

- `email_log`: the notification queue and history: type, recipient, subject, JSON `payload` of pre-formatted strings, unique `dedupe_key`, `status` (`PENDING`/`SENDING`/`SENT`/`FAILED`/`SKIPPED`), `attempts`, `last_error`, `next_attempt_at`, `sent_at`.
- `audit_log`: record of who did what (the code only ever appends; nothing in the database enforces that): `actor_id`, dotted `action` (`payment.approved`), entity, JSON `metadata`.
- `job_run`: every scheduled or manual run of a job: trigger, status, timestamps, JSON summary or error.
- `setting`: small key/value settings. Reserved: nothing reads or writes it yet.

## Rules enforced by the database itself

| Rule | How |
|---|---|
| One statement per member, plan and month (makes generation idempotent) | unique index `statement_cycle_uq` |
| Statement references are unique | unique `reference` |
| At most one payment waiting for the admin per statement | partial unique index `payment_one_pending_per_statement` (`WHERE status = 'PENDING'`) |
| A transaction reference can't be reported twice, but a declined one can be reused | partial unique index `payment_reference_in_use` (`WHERE status != 'DECLINED'`) |
| A member belongs to a plan once | unique `membership_user_sub_uq` |
| No dangling money records | `ON DELETE RESTRICT` from statements and payments to users, plans and methods |
| A message is queued at most once per event | unique `email_log.dedupe_key` |

The service code checks the same things first to give friendly errors; the indexes are the safety net for races. Enum values and "amount is positive" are enforced by the application (Zod and TypeScript), not by `CHECK` constraints.

## Migrations

Edit `src/server/db/schema.ts`, then `pnpm db:generate` to create a numbered SQL file in `drizzle/` (commit it). Migrations are applied automatically at startup by `getDb()` (the image ships the `drizzle/` folder next to the server), so an update is just a new image. Migrations only go forward. A restore of a backup from an older version is upgraded on first start; `scripts/restore.sh` refuses a backup from a newer version.

Tests open an in-memory database and apply the same migrations (`tests/helpers/db.ts`), so the schema the tests see is the schema that ships.

## Looking inside

There is no `sqlite3` binary in the image by design. To read data, take a backup (it is a plain SQLite file) and open it on your own machine with any SQLite tool. Don't edit the live database by hand.
