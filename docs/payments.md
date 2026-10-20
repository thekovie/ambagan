# Payments

Members pay **outside** the app (GCash, Maya, MariBank QR Ph), then *report* the payment. An administrator checks the receiving account and approves or declines. No money moves through this application, no banking API is used, and no receipt image is ever kept.

## Payment methods

Admin-configured destinations (`/admin/settings`): display name, account holder, account number, instructions, QR image, on/off. A method can only be switched on when it is payable (a recipient plus a number or a QR). QR images live in `ASSETS_DIR` (never `public/`), are validated by signature (PNG/JPEG/WebP; SVG refused, 1.5 MB cap) and served by an authorised route: signed-out visitors get 401, members only see active methods. See PROJECT_LOG.md for the review notes.

## Reporting a payment (`submitPayment`)

Member page: `/pay/[statementId]`. Fields: destination (one of our accounts), **sending app** (their own app/bank, stored separately), amount, reference, transaction time (read as Manila time), optional note. The optional receipt scanner (see `ocr.md`) can pre-fill them; only these structured fields reach the server.

One immediate transaction:

1. The statement must belong to the member (otherwise "not found") and be `UNPAID` or `OVERDUE`.
2. The destination must be active.
3. The reference, normalised (case, spaces and punctuation ignored), must not already be in use by a non-declined payment.
4. Insert a `PENDING` payment, move the statement to `UNDER_VERIFICATION` (its balance is **not** touched), write an audit entry.

Backed by the database: partial unique indexes allow **one pending payment per statement** and **a reference only once among non-declined payments** (a decline releases it). A different amount is allowed but flagged to the member and to the admin.

Validation: the date must survive a round trip (JavaScript silently rolls Sep 31 forward to Oct 1, so impossible dates are explicitly rejected); amount greater than 0 and at most PHP 1,000,000; reference 6+ alphanumerics (letters, digits, spaces, dashes, dots and underscores); transaction time not more than 24 h ahead and within 180 days; sending app 1-40 characters; note up to 300.

## Verification (`approvePayment` / `declinePayment`)

Admin page `/admin/payments` shows, per pending report: what the statement owes vs. what the member says they sent, which account to look in, the sending app, the reference (copyable), the time they gave, their note, earlier declined attempts for the same statement, and whether the reference was declined before. The page states plainly that no receipt is stored, so the transaction in the admin's own account is the evidence.

**Approve** (only an active admin, re-checked in the domain even though the action checks too): one immediate transaction marks the payment `APPROVED` (reviewer, time), the statement `PAID` with a zero balance, and writes an audit entry. It is the *only* way a statement becomes paid.
- **Idempotent:** approving an already approved payment returns success with no change and no second audit entry; the original decision time is kept.
- **Amount rule:** a different amount (under or over) is refused unless the admin records an adjustment note (3 to 200 characters, enforced on the server), which means accepting it as full settlement; the note is stored with the payment. Partial payments and allocations are not supported yet.
- The status check is repeated inside the UPDATE, so two admins cannot both decide the same payment.

**Decline:** needs a reason (3 to 300 characters, shown to the member). The original submission is preserved, the payment becomes `DECLINED`, the statement goes back to `UNPAID` (or `OVERDUE` if its due day has passed), and the member can report again, even with the same reference. A repeated decline is a no-op; an approved payment cannot be declined.

Both actions need a two-step confirm in the UI.

## Member views

- `/payments`: history with status (Waiting for check / Approved / Declined), the decline reason and a "Report it again" link.
- Statement pages show the contextual action per status (Submit payment, View submission, View payment details).

## Tests

`tests/payments.test.ts` (35), `tests/verification.test.ts` (25), `tests/email-notifications.test.ts` (the emails around each step), plus parser/apply/OCR and payment-method suites.

## Duplicate references and changed details

The database lets a transaction reference be reported **once** among non-declined payments, so the first reporter wins. To stop "report someone else's receipt first" from looking like ownership, a blocked attempt by a *different* member is recorded in the audit log and emails every active admin naming both members (once per pair), so the admin can check in their own account who really sent it. The member just sees "already reported".

Separately, when an active payment method's account holder, account number or QR changes (or a method is switched on), every other active member and admin gets an email saying *what* changed (never the new details), so a swapped account number can't go unnoticed. See [email.md](email.md).

## Known limitations

- Each step sends an email (member confirmation and admin request on submit; member result on approve/decline). They are queued in the same transaction as the change and sent afterwards, so a mail outage never blocks a payment: see [email.md](email.md).
- An admin who is also a member could approve their own report. Approver identity is audited, so this is left as a policy choice (a six-person group with one admin); reject `payment.userId === adminId` if you want separation of duties.
- No automatic matching with bank/e-wallet data: verification is manual by design.
