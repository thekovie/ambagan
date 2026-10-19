# Billing

Monthly statements of account (SOAs). One statement per member, plan and billing cycle. Money is integer centavos; every date is Asia/Manila.

## Data

- `subscription`: the plan (name, `ref_prefix`, `fee_minor`, `currency`, `issue_day`, `due_day`, payment instructions, active).
- `membership`: which member is on which plan, `is_active`, and `start_period` (first billable `YYYY-MM`).
- `statement`: the issued bill. It **snapshots** `subscription_name`, `amount_minor` and `currency`, so later plan edits never change it. `outstanding_minor` is the balance still owed. Unique on `(user_id, subscription_id, period)` and on `reference`.

## Generation (`src/server/billing/generate.ts`)

`generateStatements(db, { period, subscriptionId?, actorId, now? })` runs in one transaction and is idempotent:

- Bills only **active members of active plans** whose membership started on or before the period.
- Insert uses `ON CONFLICT (user, plan, period) DO NOTHING`: an existing statement (including a cancelled one) is never modified, duplicated or replaced. Running it twice, or concurrently, cannot double-bill.
- New statements are `UNPAID`, with amount and name copied from the plan *at that moment*, `issued_at = now`, and `due_at` = the last millisecond of the plan's due day in Manila (a payment on the due day is on time).
- A random reference that happens to collide is redrawn (up to 5 times); any other error aborts the whole run.
- It never backfills on its own: only the period you ask for is generated. The admin page offers the current and previous 11 months (the action rejects anything else, and any plan that isn't active). Issuing a *past* month uses each plan's **current** fee and is dated today, so the form warns and asks for a second press to confirm.
- Runs use an immediate (write-locking) transaction. The unique index plus `DO NOTHING` is what guarantees no duplicates even if two runs overlap; this is a property of the schema, not something the tests simulate.
- An audit entry (`statements.generated`) is written when something was created.

Deactivating a member pauses their membership; reactivating moves `start_period` up to the current period, so months spent paused are never billed retroactively.

## References

`SPOT-202610-K4M2Q8`: plan prefix, `YYYYMM`, and six characters from a 31-character alphabet without `0 O 1 I L` (`crypto.randomInt`, about 887 million values per prefix and month). Uniqueness is enforced by the database.

## Status

| Status | Meaning |
|---|---|
| `UNPAID` | Issued, due date not yet passed |
| `UNDER_VERIFICATION` | Member reported a payment; waiting for the admin (set by the payments milestone) |
| `PAID` | Admin approved the payment |
| `OVERDUE` | Unpaid and the due day has ended |
| `CANCELLED` | Admin cancelled it; balance zero, history kept |

The admin list's status filters follow the same rule (an unpaid statement past its due day appears under Overdue, not Unpaid), and the list is capped at 500 rows. `markOverdue` (run by the daily job and after manual generation) turns `UNPAID` into `OVERDUE` once `due_at` has passed. Statements under verification are never marked overdue. The UI also applies `effectiveStatus()`, so an unpaid statement past its due day reads "Overdue" even before the job has run.

## Cancellation (`cancelStatement`)

Only `UNPAID` or `OVERDUE` statements can be cancelled; a reason (3 to 200 characters) is required and stays admin-only (members just see "Cancelled by admin"); the admin UI uses a two-step confirm. The amount is kept, the balance becomes zero, `cancelled_at` / `cancel_reason` are stored, and an audit entry records who, why and the previous status. The cycle stays used, so it can never be regenerated. The status check is repeated inside the UPDATE so two admins cannot both succeed.

## Access

- Members read only their own statements: ownership is part of the query, so another member's id is a 404.
- Admin pages (`/admin/statements`) re-check the admin role in the page and in each server action.
- The member detail page has a print layout (`print:` styles hide the shell and show a letterhead).

## Tests

`tests/billing.test.ts` (generation rules, idempotency, snapshots, collision retry, overdue, cancellation, queries), `tests/period.test.ts`, `tests/dates.test.ts`, `tests/statement-view.test.ts`.

## Known limitations

- Statement amounts are whole-statement only; partial payments and allocations are not supported yet.
- PDF export is deferred; use the browser's print dialog.
- Fee and due-day changes affect only statements generated afterwards.
