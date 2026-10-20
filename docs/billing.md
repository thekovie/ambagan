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
| `UNDER_VERIFICATION` | Member reported a payment; waiting for the admin (set when a payment is reported) |
| `PAID` | Admin approved the payment |
| `OVERDUE` | Unpaid and the due day has ended |
| `CANCELLED` | Admin cancelled it; balance zero, history kept |

The admin list's status filters follow the same rule (an unpaid statement past its due day appears under Overdue, not Unpaid), and the list is capped at 500 rows. `markOverdue` (run by the daily job and after manual generation) turns `UNPAID` into `OVERDUE` once `due_at` has passed. Statements under verification are never marked overdue. The UI also applies `effectiveStatus()`, so an unpaid statement past its due day reads "Overdue" even before the job has run.

## Cancellation (`cancelStatement`)

Only `UNPAID` or `OVERDUE` statements can be cancelled; a reason (3 to 200 characters) is required and stays admin-only (members just see "Cancelled by admin"); the admin UI uses a two-step confirm. The amount is kept, the balance becomes zero, `cancelled_at` / `cancel_reason` are stored, and an audit entry records who, why and the previous status. The cycle stays used, so it can never be regenerated. The status check is repeated inside the UPDATE so two admins cannot both succeed.

## Ambag: one-off split bills (`src/server/bills`, `src/lib/split`)

Besides the monthly plans, the admin can split a one-off bill (dinner, the internet, a gift) between friends: **Admin → More → Ambag → New ambag**. The admin fronted the money; each friend gets their own statement to pay the admin back, using the same pay, report and verify flow as everything else.

- **Splitting** (`src/lib/split`, pure, integer centavos): equally, by shares (a couple counts as 2), by percentage (must total exactly 100%), by exact amounts (must total the bill), or itemised ("By items": each receipt line goes to the people who shared it, then tax, service charge, tip, delivery fee, discounts and other charges are added as a peso amount or a percentage of the items and shared in proportion to what each person had, or equally; a discount is always proportional and can never exceed the items; an optional receipt total is checked against what the items and extras add up to). Shares always add up to the total exactly; the odd centavo goes to a different person each time (a deterministic hash tie-break), never always the same one. The builder runs the same engine as the server for its live preview, and the server recomputes everything on save.
- **What gets created** (`createBill`): the bill (with the split as entered and as computed), and one statement per friend with something to pay. The admin's own share is counted but not billed. Statements are ordinary statements (reference `AMBAG-YYYYMM-XXXXXX`, one per person per bill, due at the end of the chosen day in Manila) attached to a single hidden "one-off" plan, so payment, verification, overdue marking, reminders and cancelling all work unchanged. They are kept out of the monthly tiles on the overview, which counts them separately as "ambag open".
- **Friends see only their own share.** A friend's statement shows the bill, the total, the split method and *their own* lines, never anyone else's name or amount (`getShareForStatement`).
- **No account needed.** Friends without an account are *guests* (**Members → Friends without an account**, or added inline in the builder). Every person in a bill has a private link (see [authentication.md](authentication.md#private-share-links-friends-without-an-account)) that the admin copies from the bill page, with a ready-made chat message. Guests with an email also get the usual emails; a guest can later be invited to join, keeping their history.
- **Editing and cancelling.** A bill is not edited once sent: cancel it (with a reason) and make a new one. Cancelling is all or nothing and is refused while anyone has paid or reported paying, so that money is dealt with first (Verify).
- **Why the database looks the way it does:** statements require a plan and a month, so bill statements point at one hidden plan (`subscription.kind = 'ONE_OFF'`, never listed, edited or generated for) and `statement.bill_id` marks them; the old one-statement-per-member-plan-month index became two partial indexes so a friend can be in several bills a month. See [database.md](database.md).

## Access

- Members read only their own statements: ownership is part of the query, so another member's id is a 404.
- Admin pages (`/admin/statements`) re-check the admin role in the page and in each server action.
- The member detail page has a print layout (`print:` styles hide the shell and show a letterhead).

## Scheduled jobs (the daily run)

No cron, no second container: `src/instrumentation.ts` (which loads `instrumentation-node.ts`) starts a one-minute timer inside the web server process (Node runtime only, never during `next build`). Each tick does three things: (1) if it is 08:00 Manila or later and today's run hasn't succeeded yet, take the daily backup and then (2) run the daily job, and (3) send any email that is due or waiting out a retry. Because the condition is "08:00 or later" rather than "exactly 08:00", an app that was off at 08:00 runs the job on its first tick after it starts.

The daily job (`reconcile`) is a series of idempotent steps, so it is safe to run late, twice or by hand:

1. **Issue statements** for the current Manila month for every active plan whose issue day has arrived, to every active member whose membership has started. Existing statements (including cancelled ones) are never touched.
2. **Mark overdue**: unpaid statements whose due day has ended in Manila.
3. **Queue emails** for statements that are still `UNPAID` or `OVERDUE`: "new statement" (for statements issued in the last 7 days, and only for this or last month: a back-filled old month isn't announced as news), "due tomorrow", "due today", and "overdue" the day after the due day, then weekly, **four notices at most** (so a member who left the group is not nagged forever). Paid, under-verification and cancelled statements get nothing, and a statement that goes back to unpaid after a declined payment resumes. Each notice has a dedupe key (`DUE_TODAY:<statementId>`, `OVERDUE:<daysLate>:<statementId>`), so repeating the job never repeats a message. A day that was missed entirely is not made up: the next reminder simply follows the calendar.
4. **Prune** finished email rows and job history older than 90 days, and expired sessions and sign-in links.

`job_run` records every run (trigger, status, summary, error). A scheduled run happens at most once per Manila day, a failed one is retried after 30 minutes (not every minute), and a run still marked running after 30 minutes is treated as crashed. An admin can also press **Run it now** on Admin → Statements; it can't overlap a run in progress.

**Joining mid-month.** A member added (or reactivated) after their plan's due day is first billed **next** month, so they never get a statement that is overdue on arrival; the due day itself still counts as on time. Before the due day they are billed for the current month at the next daily run.

Limits: statement generation covers only the current Manila month, so if the app is down for a plan's whole issue-day-to-month-end window, issue that month by hand with **Generate missing** (automatic back-filling could bill members for months they never owed); a run needs the web process to be up, which is the trade-off of having no external scheduler.

## Tests

`tests/billing.test.ts` (generation rules, idempotency, snapshots, collision retry, overdue, cancellation, queries), `tests/period.test.ts`, `tests/dates.test.ts`, `tests/statement-view.test.ts`, `tests/scheduler.test.ts` (daily job, reminders, runner).

## Known limitations

- Statement amounts are whole-statement only; partial payments and allocations are not supported yet.
- PDF export is deferred; use the browser's print dialog.
- Fee and due-day changes affect only statements generated afterwards.
