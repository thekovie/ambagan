# Project Log — ambagan

Running record of decisions, issues, deviations and test results. Newest entries last within each date. Update in every PR.

## 2026-10-19 — Kickoff

### Decisions
- **Name / location:** `ambagan` (Filipino: pooling money to split a shared cost). Private GitHub repo `thekovie/ambagan`, local path `~/Documents/GitHubRepos/ambagan`.
- **Workflow:** one branch per feature, PR into `main`, merge only after `typecheck`, `lint`, `test`, `build` pass. Conventional commits. No co-author trailers or tool attributions anywhere (commits, PRs, code, docs). Commit identity: global git identity.
- **UI direction:** brief asked for minimal/neutral SaaS; owner asked for a standout look. Owner chose *fully expressive*. Kept as hard floors: WCAG 2.2 AA, light/dark, status not conveyed by color alone.
- **Scheduler:** in-process (`instrumentation.ts` + cron) with DB-backed `job_runs` for idempotency, so the app stays a single service.
- **Package manager:** pnpm. Node pinned to 22 LTS (`.nvmrc`); dev machine runs Node 26.

### Environment audit (Phase 0)
- No existing project; greenfield. Node v26.11.1, pnpm 12.11.2, Docker 29.4.0, `gh` authenticated as `thekovie`.
- Versions at scaffold time: next 16.4.2, react 19.3.0, tailwindcss 4.3.3, zod 4.6.7, vitest 5.0.5, drizzle-orm 0.45.4, better-sqlite3 13.0.3 (engines node >=22), next-auth@beta 5.0.0-beta.32, tesseract.js 7.0.0.
- **Compatibility finding:** `next-auth@5.0.0-beta.32` and `@auth/drizzle-adapter` peer-require `nodemailer ^7.0.7 || ^8.0.5`, while latest nodemailer is 10.x. Pin nodemailer to 8.x. Auth.js v5 is still published as `beta`; accepted risk, revisit if stable ships.

### Issues
- `create-next-app` generates an `AGENTS.md` that `next dev` re-creates. It is gitignored to keep the repo free of tool-specific files.
- `.gitignore` default `.env*` would have ignored `.env.example`; added `!.env.example`.
- `vite-tsconfig-paths` is redundant with Vite's native `resolve.tsconfigPaths`; removed. Config is `vitest.config.mts` to avoid the CJS/ESM loader warning.
- **CI failure on PR #1:** `tsc` failed with `Cannot find name 'LayoutProps'`. That global type comes from Next's generated route types (`.next/types`), which existed locally but not on a clean CI checkout. Fix: `typecheck` now runs `next typegen` first. Verified from a clean tree.

### Tests
- `src/env.test.ts`: 4 passing (dev without SMTP, short secret rejected, SMTP required in production, SMTP parsed).

## 2026-10-19 — feat/db-schema

### Decisions
- **Schema** (`src/server/db/schema.ts`): users + Auth.js tables (adapter-compatible names/columns), invitation, subscription, membership, statement, payment_method, payment, email_log, audit_log, job_run, setting. Enum values exported as `const` tuples so zod/app code share them.
- **Money** as integer minor units; **timestamps** as UTC ms integers; billing periods as `YYYY-MM` text. Display/due-date math in Asia/Manila happens in `src/server/billing` (next milestone).
- **Statement snapshots:** `subscription_name`, `amount_minor`, `currency` copied onto each statement so fee changes never rewrite history. `outstanding_minor` tracked separately for the balance.
- **History protection:** user/subscription/statement FKs are `ON DELETE RESTRICT`; deactivate instead of delete. Audit/email FKs use `SET NULL` so logs survive.
- **Duplicates:** `statement(user, subscription, period)` unique index enforces one statement per cycle; `statement.reference` and `email_log.dedupe_key` unique. `payment.transaction_ref_norm` (indexed, not unique) powers duplicate-reference *warnings* because a declined payment may be legitimately resubmitted.
- **Migrations:** drizzle-kit generated SQL committed in `drizzle/`; applied automatically on first `getDb()` (WAL, `foreign_keys=ON`, `busy_timeout=5000`).
- **Native build:** `better-sqlite3` approved in `pnpm-workspace.yaml` (`allowBuilds`). Verified it loads on Node 26 locally; CI uses Node 22.

### Tests
- `tests/db-schema.test.ts`: 7 tests (cycle uniqueness, reference uniqueness, FK enforcement, restrict-delete, dedupe key, defaults, WAL + FK pragmas on a file DB). Total 11 passing.

### Issues
- **CI failure on PR #2:** `pnpm install --frozen-lockfile` aborted with `ERR_PNPM_IGNORED_BUILDS` because `esbuild` (pulled in by drizzle-kit) has an unreviewed build script. esbuild's postinstall is only a binary sanity check, so it is explicitly set to `false` in `allowBuilds` (better-sqlite3 is `true`).

## 2026-10-19 — feat/design-system

### Decisions
- **Visual world: "tingi sachet rack".** Candidates were derived from the audience's world and one was assigned by dice roll; owner confirmed it. Each statement is a foil strip with a crimped seal and a perforated stub. Status is repeated in edge form (stub attached / half torn / gone / creased corner / struck) plus an icon-and-word capsule, so colour is never the only signal.
- **Palette:** ink-violet ground (dark) or cool foil-white (light); foils magenta, cobalt, tangerine, lime. Magenta is reserved for the one action that needs doing now (pay/submit/overdue). Text on foils uses dedicated `--on-foil-*` tokens for AA contrast.
- **Type:** Archivo variable (width axis) via `next/font/google`: narrow heavy for pesos and headings, normal width for text. Statement references use the system monospace.
- **Theme:** class-based dark mode, set before first paint by a constant inline script (stored in `localStorage` key `theme`, falls back to system). Toggle uses `useSyncExternalStore`.
- **Shells:** one `AppShell` with `member` (rail on desktop, bottom tabs on mobile) and `admin` (rail on desktop, scrolling tabs on mobile) variants. Auth wiring comes in the auth milestone.
- **Pure enums module** (`src/lib/enums.ts`) so client components never import Drizzle via the schema file.
- **Dev gallery** at `/kit` (404 in production) to verify every state in both themes.
- `.impeccable/` (design tooling state) is gitignored; `PRODUCT.md` is committed.

### Issues
- Half-torn stub (rotated) overflowed the right edge on mobile: reduced rotation and clipped horizontal overflow on `<main>`.
- Outline button on the cobalt sachet had weak contrast: inherits the sachet's foreground colour there.
- Browser screenshots can only be saved inside the project workspace, so captures go to `.impeccable/review/`.

### Tests
- `tests/money-status.test.ts`: money formatting/parsing (no float drift, rejects over-precise input) and status labels/actions. Total 17 passing.
- Detector (design detector) over changed UI: no findings. Verified in browser: no horizontal overflow, all interactive targets >= 44px, dark and light themes.

### Finish review (design system)
- First review: disposition *fix*, eight material fixes (OVERDUE had no visible action on its own magenta field; hard-offset button shadow; hero stretched into a full-width banner on desktop; primary action not full width on mobile; no visible tear; header truncation at narrow widths; collapsed word gaps in the condensed display face; rack had no hanging device). All applied in one batch.
- Verdict pass: 6 resolved, 2 partial. Partial = missing evidence, not known defects: the mobile hero buttons were not recaptured, and the tear was verified numerically in the browser (stub rotated about 7deg at 500ms, opacity 0 and hidden at 1.9s) rather than as an image.
- Not inspected: 360px and 390px real widths (the browser reported 489 CSS px), light-theme rack.
- Known cosmetic items carried forward: the desktop hero column is empty below the hero until the dashboard adds its activity panel (feat/member-dashboard); the dark rack rail was made more visible after the review; sachet vocabulary in the app chrome (rail, tabs) is still stock capsules.
- Reviewer-flagged hang-hole vs. crease collision was fixed (hole moved right) after the captured frame; not re-captured.

## 2026-10-19 — feat/auth

### Decisions
- **Auth.js v5 beta + Drizzle adapter + Nodemailer provider, database sessions.** Chosen over JWT sessions so deactivating a member revokes access immediately. Peer constraints pinned `nodemailer@^8`.
- **No self-signup:** `checkSignIn` gates both the link request and the link redemption. Unknown/deactivated addresses see the identical "check your email" page but get no mail (no account enumeration). `ADMIN_EMAIL` bootstraps/promotes the first admin.
- **Invitations:** random 256-bit token, SHA-256 stored, 7-day expiry, single use via a conditional update, a new invite revokes older pending ones. The invite page treats invalid/expired/deactivated identically.
- **Lazy Auth.js config** so env/DB are never touched at build time.
- **Authorization lives on the server:** `requireUser`/`requireAdmin` in layouts and pages (actions must call them too); non-admins get 404 on `/admin/*`. `src/proxy.ts` (Next 16's renamed middleware) is only a redirect shortcut.
- **Rate limiting:** in-memory fixed window (5/address, 20/IP per 15 min). Known ceiling: single process.
- **Auth pages** reuse the sachet system (cobalt foil panel with crimped edge + form column).
- Login/invitation emails are plain inline-HTML for now; they move to React Email + the queue in feat/email-queue. The dev fallback prints the link to the server console.

### Issues
- Scaffold had enabled `cacheComponents` and `partialPrefetching`; with them every session read raised "Next.js encountered the unstable value crypto.getRandomValues() while prerendering". The app is fully per-user and dynamic, so both flags were removed (and `serverExternalPackages: ["better-sqlite3"]` added). Re-ran the whole flow afterwards: 0 prerender errors.
- `ReturnType<typeof auth>` resolves to the middleware overload with a lazy config; the session user type now comes from the augmented `Session`.
- pnpm reported an unmet peer (`@types/node` for vitest): bumped `@types/node` to `^22` to match the Node 22 target.
- Mobile has no sign-out yet: the account footer lives in the desktop rail. It moves into the Settings page (member-dashboard milestone).

### Tests
- `tests/auth-domain.test.ts` (16) and `tests/auth-email.test.ts` (4): 37 tests total, all passing; typecheck, lint, production build clean.
- Manual run against a dev server and a scratch DB: admin bootstrap -> `/admin/dashboard` 200; stranger -> no mail, `/dashboard` redirects to login; member -> `/dashboard` 200, `/admin/dashboard` 404; member deactivated -> live session redirected to login, new link not sent; reused link -> `/login/error?error=Verification`; invite page valid/invalid states, accept sends exactly one mail, reopen shows "Already accepted".
- Not tested: real SMTP delivery (no server configured), the Auth.js browser flow beyond the paths above, automated end-to-end tests (planned for the e2e milestone).

### Security review (auth) and fixes
Independent review of the staged diff found no critical issues and these to fix, all done:
- **HIGH, link origin from request headers:** with `trustHost` and no `AUTH_URL`, a forged Host/X-Forwarded-Host could make the emailed link point at an attacker's site. `AUTH_URL` is now set from `APP_URL`. Verified: request to `localhost:3100` with `APP_URL=http://pinned.example:3100` produced a link on `pinned.example`.
- **HIGH, limits bypass via the Auth.js route:** `POST /api/auth/*` now returns 404; sign-in/out only through server actions. Verified 404.
- **MEDIUM:** response-time account enumeration (mail send no longer awaited); spoofable client IP (last `X-Forwarded-For` entry, shared helper, tested); unbounded rate-limit map (bounded with O(1) eviction, tested); deactivated user with a live cookie looped between /login and /dashboard (now treated as signed out, verified with curl following redirects).
- **LOW:** production guard on the dev mail fallback; `server-only` on server modules; baseline security headers (verified in a response); documented limits.
- **Accepted and documented:** per-address lockout abuse (M5), sign-in link consumed by scanners (L2), sticky `ADMIN_EMAIL` promotion (L3), invite consumed before mail send (L6).
- The earlier manual curl script used the POST route that is now closed, so the final verification used the real form/server action plus direct DB state changes. Unit tests: 42 passing.

## 2026-10-19 — feat/members-subscriptions

### Decisions
- **Members service** (`src/server/members/service.ts`): `addMember` creates user + optional membership (starts this Manila period) + invitation + audit in one transaction; duplicate emails (case-insensitive) rejected. `setMemberActive` revokes sessions and pauses/restores memberships in one transaction; an admin can't deactivate themselves or the last active admin. `resendInvitation` revokes older links. Expected failures are returned as `{ ok: false, error }` values, not thrown.
- **Admin-visible invite link:** after adding or re-inviting, the admin sees the invite link with a copy button. If SMTP fails the admin can hand it over by chat, so a mail outage never blocks onboarding.
- **Subscriptions service:** Spotify (SPOT, PHP 50.00, issue day 1, due day 10) is seeded on first DB open only when no plan exists. Edits apply to statements issued afterwards; statements already carry their own name/amount/currency snapshot (tested). `refPrefix` is fixed after creation (separate create/update form parsers). Days limited to 1-28 so every month has them; due day can't precede issue day.
- **Billing periods** (`src/server/billing/period.ts`): `YYYY-MM` computed in Asia/Manila, not UTC (tested around the month boundary).
- **Audit log** entries for member added/activated/deactivated/invite resent and subscription created/updated (with before/after of changed fields).
- **UI:** `/admin/members` and `/admin/subscriptions`. Destructive step uses a two-step confirm button instead of a modal. Native `<select>`/checkbox for phone-friendly pickers. New primitives: `Textarea`, `NativeSelect`, `ConfirmButton`, `CopyField`.

### Issues
- **Bug found by driving the UI:** the first version of `ConfirmButton` deactivated a member on the first press. React flushed the state change inside the click, switching the button's `type` to `submit` before the browser decided whether to submit. Fixed by keeping `type="submit"` and cancelling the first click with `preventDefault`. Re-verified: first press arms ("Sure? Deactivate"), second confirms, it disarms after 4 s.
- A zod refine tuple spread failed type-checking (readonly path); split into a plain predicate and error object.

### Tests
- `tests/members.test.ts`, `tests/subscriptions.test.ts`, `tests/period.test.ts`: 80 tests in total passing; typecheck, lint, production build clean.
- Manually verified in a browser against a scratch DB: add member (invite emailed to the dev console, link shown), duplicate guard, two-step deactivate then reactivate, plan fee edit persisted with an audit entry showing from/to.
- Not tested: real SMTP delivery; non-admin access to these pages is covered by the layout gate verified in the auth milestone.

### Code review (members and plans) and fixes
Independent review: approved, no critical/high findings; items fixed before merge:
- **Forms lost input after a server error** (React 19 resets uncontrolled forms after every action, including failed ones). Actions now echo the submitted values and fields read them through `defaultValue`. Verified in the browser: a rejected fee and a typed instruction both stay in place.
- **Duplicate DOM ids** across the per-plan forms made `aria-describedby` point at another plan's error: ids now come from `useId()`; issue/due selects also expose their errors. Verified: no duplicate ids on the page.
- **Fee bounds and parsing:** fee capped at ₱1,000,000; `parsePesosToMinor` now refuses commas that aren't thousands separators (`50,50` used to become ₱5,050) and values that don't fit exactly.
- **Server accepted enrolment in an inactive plan** (only the page filtered): new `SUBSCRIPTION_INACTIVE` error.
- **Billing guard for reactivation:** reactivating moves each membership's first billable period up to the current period (SQLite `max()` on `YYYY-MM`), so paused months are never back-billed. **Constraint for the billing milestone:** the generator bills only periods >= `startPeriod` and never backfills automatically.
- Accessibility: permanently mounted live regions for results, per-person hidden names on repeated row buttons, `ConfirmButton` disarms on blur (6 s), copy confirmation is announced.
- Defence in depth: plan updates write an explicit field list; default plan seed uses `ON CONFLICT DO NOTHING`.
- Tests strengthened: a real rollback test (forced FK failure after the user insert), a prefix test that can fail, a clearer last-admin test, expired/accepted invites, fee cap, comma rules. Total 88 passing.
- Accepted: stale error text can linger in a row after a later success on the other form; no automated test of the server actions' `requireAdmin` calls (covered by the layout gate and code review; planned for the e2e milestone).

## 2026-10-19 — feat/billing-soa

### Decisions
- **Generation is a single transaction and idempotent by construction:** `INSERT ... ON CONFLICT (user, plan, period) DO NOTHING` on the existing unique index. Reruns, overlapping runs and cancelled cycles can never create or alter a statement. Only the requested period is generated (no automatic backfill), consistent with the reactivation guard from the members milestone.
- **Snapshots:** name, amount and currency are copied onto each statement at generation. Verified by tests that change the plan afterwards.
- **Issue date = actual generation time** (an honest record when an admin generates late); **due = last millisecond of the due day in Manila**.
- **References:** `PREFIX-YYYYMM-XXXXXX`, 31-character alphabet without 0/O/1/I/L, `crypto.randomInt`; collisions are redrawn (tested with a forced collision).
- **Overdue:** the persisted flip (`markOverdue`) runs after manual generation and later in the daily job. The UI also derives `effectiveStatus` so nothing reads "Unpaid" after its due day. Under-verification statements are never marked overdue.
- **Cancel:** UNPAID/OVERDUE only, reason required, balance zeroed, audit entry with previous status, status re-checked inside the UPDATE (two admins can't both win), cycle slot stays used.
- **Access:** statement ownership is part of the query (other member's id -> 404). Admin page and actions re-check the role.
- **UI:** member `/statements` (hung rack of strips) and `/statements/[id]` (strip, details, payment instructions, print layout); admin `/admin/statements` (generate missing, filters, cancel with reason + confirm). Overdue strips use the inverse action button (magenta foil would vanish on a magenta strip).

### Issues
- A test used the real clock and failed once "today" passed its fixture's due date; tests that depend on time now pass `now` explicitly.
- Print: shell elements hidden with `print:` variants; not exercised in a real print dialog (only the classes were verified).

### Tests
- `tests/billing.test.ts` (27), `tests/dates.test.ts`, `tests/statement-view.test.ts`, extended `tests/period.test.ts`: 121 tests passing; typecheck, lint, build clean.
- Browser/curl against a scratch DB: generate from the admin form (1 created, overdue because it is past the 10th), rerun (nothing created), member list/detail rendering, owner 200 / other member 404 / unknown id 404 / member on admin page 404, cancel with the two-step confirm (balance 0, reason stored, both audit entries written).

### Code review (billing) and fixes
Independent review found no way to double-bill, overwrite or lose a statement, and no critical/high issues. Fixed before merge:
- **Back-fill used today's plan values silently:** issuing a past month now shows a warning (current fee, dated today, probably overdue) and needs a second press; the action only accepts the 12 offered months and active plans.
- **Admin's cancellation reason was visible to members** (it can mention other people): members now see "Cancelled by admin"; the reason stays in the admin list and audit log. The form says so. Reason capped at 200 characters server-side.
- **Admin status filter disagreed with the displayed status:** "Overdue"/"Unpaid" filters now apply the same due-day rule as `effectiveStatus` (tested). List capped at 500 rows.
- **Copy promised automation that does not exist yet:** admin and member copy reworded (the scheduler lands in feat/scheduler).
- Generate action: errors are caught and reported ("nothing was changed", the run is one transaction); unknown/inactive plan is rejected instead of reporting "nothing to create".
- Accessibility: the statements list link keeps its natural accessible name (status, amount, date) instead of an overriding aria-label; "How to pay" only shows on unpaid/overdue statements.
- Robustness: reference-collision detection also checks the SQLite error code; generation and cancellation use immediate transactions so a future second writer (job runner) waits on the lock instead of failing mid-transaction. A weak period test now uses an instant where UTC and Manila differ.
- Still open (accepted): focus is not managed after a successful cancel (the row disappears); `/pay/:id` and `/payments` links 404 until the payment milestones; print layout only checked by classes, not in a real print preview.
- Tests: 124 passing.
