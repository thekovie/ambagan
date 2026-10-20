# Authentication

Invitation-only, passwordless. Members sign in with a one-time email link; there is no self-signup.

## Stack

- Auth.js v5 (`next-auth@beta`) with the Drizzle adapter and the Nodemailer provider.
- **Database sessions** (30 days, refreshed daily). Sessions live in the `session` table, so deleting a member's rows or deactivating them takes effect on the next request.
- Config is lazy (`NextAuth(() => buildConfig())` in `src/server/auth/config.ts`): env and database are read per request, never at build time.

## Flow

1. **Admin invites a member** (Admin → Members): a `user` row (`MEMBER`) is created and `createInvitation()` issues a 256-bit token. Only its SHA-256 is stored (`invitation.token_hash`). Links expire after 7 days; a new invitation revokes older pending ones for that member.
2. The member opens `/invite/<token>`. A valid link shows a confirm button; `acceptInvite` marks the invitation used (single use, conditional update) and requests a sign-in link for the member's address.
3. **Sign-in link** (`/login` or step 2): `requestLoginLink` validates the email with Zod, applies rate limits, and calls Auth.js `signIn("nodemailer")`. The link works once and lasts 24 hours. Opening it sets `emailVerified`, creates a session and redirects to `/dashboard`.
4. **Sign out** deletes the session row (`signOutAction`).

## Who may sign in (`checkSignIn`)

- Email must belong to an existing, active `user`.
- Exception: `ADMIN_EMAIL` bootstraps (or promotes) the first administrator on its first request.
- Unknown and deactivated addresses get the same "check your email" page as valid ones, but no email is sent. This avoids revealing who is in the group.
- The Auth.js `signIn` callback re-checks at the moment the link is opened, so a member deactivated after the link was sent cannot use it.

## Authorization

- `requireUser()` / `requireAdmin()` (`src/server/auth/session.ts`) run in the `(member)` and `admin` layouts and in every page. Server actions must call them again (layouts do not protect actions).
- `canAccess(user, role)` is the single rule: deactivated users have no access; admins can do everything members can.
- Signed-in non-admins get a **404** on `/admin/*`.
- `src/proxy.ts` redirects requests with no session cookie to `/login`. It is a UX shortcut only: it cannot validate a session, so it is never the security boundary.

## Abuse protection

- **Pinned origin:** `AUTH_URL` is set from `APP_URL` on every request, so emailed links (and Auth.js redirects) always use our own origin and a forged `Host`/`X-Forwarded-Host` cannot redirect a sign-in token to an attacker's site.
- **Only server actions can request links.** `POST /api/auth/*` returns 404; the route serves only `GET` (magic-link callback, csrf, session). This keeps the limiters below on every entry path.
- Fixed-window in-memory limiter (`src/server/auth/rate-limit.ts`): 5 link requests per address and 20 per IP per 15 minutes, bounded to 2000 tracked keys (oldest evicted in O(1)). Single process only; move to SQLite if the app ever runs more than one instance.
- **Client IP** (`client-ip.ts`) is the *last* `X-Forwarded-For` entry, i.e. the hop appended by our single trusted proxy. Earlier entries and `X-Real-IP` are client-controlled and ignored. The reverse proxy must append to (not blindly pass through) `X-Forwarded-For`; Caddy, Traefik, nginx and Coolify's proxy do.
- **Constant-latency sign-in:** the login email is sent without awaiting SMTP, so response time doesn't reveal whether an address exists. Sign-in mail is sent directly, never queued or retried (the link is a secret that is not stored): a failure is logged on the Emails page and the person simply requests a new link.
- A deactivated member with a live cookie is treated as signed out (no redirect loop).
- Cookies are Auth.js defaults: httpOnly, SameSite=Lax, `Secure` over https. CSRF is handled by Auth.js on its routes and by Next.js origin checks on server actions.
- Responses carry `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`. Every page also gets a Content-Security-Policy with a per-request nonce, and `Strict-Transport-Security` (see [deployment.md](deployment.md#security-headers)).
- Modules that touch secrets or the environment (`env`, the mail transport and worker, the backup and job runners) import `server-only`, so an accidental client import fails the build; the rest of `src/server` is kept out of client code by convention, and no `"use client"` file imports it (checked in review).

## Private share links (friends without an account)

An ambag bill gives every person their own statement, and every statement has a private link, `/s/<token>`, that works with no account and no password. It shows that person's share and how it was worked out, the active payment accounts (with QR), and a form to report their payment. Nothing is marked paid until an admin approves it, exactly as for members.

- **The token** is `statementId.version.signature`, where the signature is HMAC-SHA256 of `share:v1:<id>:<version>` keyed with `AUTH_SECRET`. It is derived, not stored, so the admin can copy a link again at any time. Replacing a link (`rotateShareLink`) bumps `statement.link_version`, so the old URL stops working at once. **Rotating `AUTH_SECRET` invalidates every link** (and every session), so send fresh links afterwards.
- **What a link can do:** view and report on exactly one statement that belongs to a bill, until 90 days after its due date; it is read-only once paid or cancelled. It sets no cookie and reaches nothing else (no dashboard, no other statements, no other people's shares; the bill's full split never leaves the server, only that person's own lines).
- **Checking:** `verifyShareToken` checks the format, compares the signature in constant time *before* touching the database, then requires a bill statement, a matching version, an unexpired date and an active person. Every failure looks the same (a plain 404), so nothing reveals why a link failed. `requireShareAccess` is the first call in every page, action and route under `/s` and `/api/s`; `tests/authz-guard.test.ts` fails if one starts with anything else.
- **Abuse:** the signature is checked first (a pure HMAC), and a valid link is **never** counted or limited: many friends can share one address (mobile data, an office), so limiting valid links could only lock real people out. Only bad links count against the caller's address (30 per 15 minutes, in memory); an address that keeps sending them is turned away, which just keeps junk traffic cheap. The responses carry `Referrer-Policy: same-origin` (the link never reaches another site, yet a form post without JavaScript still carries a real `Origin`), `X-Robots-Tag: noindex` and `Cache-Control: no-store`, and the pages set noindex metadata, so a link does not leak to other sites, search engines or caches.
- **Never stored in the queue:** emails to guests carry only a flag; the link is made when the email is sent, from the statement's current version. So the database and backups never hold working links, and replacing a link also fixes anything still queued or resent.
- **Signing key:** derived from `AUTH_SECRET` with HKDF for this one purpose (`ambagan/share-link/v1`), so the secret itself is never used to sign links.
- **At the reverse proxy:** cap request bodies for `/s/*` (about 64 KB is plenty; the app's general 2 MB limit exists for QR uploads), and keep `/s/` and `/api/s/` paths out of access logs, because the link is in the URL. Chat apps that preview links will fetch them too, which is unavoidable.
- **Guests** are people with no account: a `user` row with `is_guest` set and, when no real address is known, a placeholder `guest-<id>@guests.invalid` (nobody to email, so notifications are skipped). A guest cannot sign in even with a real address (`checkSignIn` refuses guests, answering exactly as for an unknown email) until an admin invites them to join. Guests with a real address get notification emails that link to their private page instead of the signed-in pages.
- **If a link leaks** (sent to the wrong chat): replace it; the old one dies immediately. A leaked link can at worst file a payment report on that one statement, which the admin would decline when the money isn't in the account.

## Email delivery

`sendMail()` (`src/server/email/transport.ts`) uses Nodemailer over SMTP with `requireTLS` unless implicit TLS is configured. In development without SMTP settings the message (including the link) is printed to the server console; with `NODE_ENV=production` it throws instead, and config validation refuses to start without SMTP settings (`src/env.ts`). Login and invitation emails use inline-styled HTML plus a plain-text twin (`auth-templates.ts`); they are sent directly rather than through the notification queue because the one-time link is a secret that must not be stored (see [email.md](email.md)); every other notification uses React Email and the queue.

## Environment

`AUTH_SECRET` (32+ chars), `APP_URL`, `ADMIN_EMAIL`, plus the SMTP variables. See `.env.example`.

## Tests

- `tests/auth-domain.test.ts`: tokens, no-self-signup gate, admin bootstrap/promotion, deactivated users, invitation lifecycle (hash-only storage, expiry, single use, revocation), rate limiter, role rule.
- `tests/auth-email.test.ts`: link content, HTML escaping.
- Manually verified against a running dev server with a scratch database (see PROJECT_LOG.md): admin bootstrap, unknown address, member vs admin routes, deactivation of a live session, link reuse, invite acceptance.

## Known limitations

- Rate limits reset on restart. The per-address limit means anyone can briefly stop a specific member from requesting a link (6-person app; the admin can re-invite, which has no per-address limit).
- The sign-in link is redeemed by a plain GET, so an email security scanner that prefetches links can use it up; request a new one. (The invite flow already uses a confirm button.)
- `ADMIN_EMAIL` is promoted to admin on every sign-in; changing the variable does not demote the previous admin.
- An invitation is consumed when accepted, before the email is sent; if SMTP is down the member falls back to `/login`.
- Auth.js v5 is still published as a beta.
- No account-level "log out everywhere" button yet (deactivation does it).
