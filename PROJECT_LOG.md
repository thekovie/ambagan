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
- `create-next-app` generates an `AGENTS.md` that `next dev` re-creates. It is gitignored (along with `CLAUDE.md`) to keep the repo free of tool-specific files.
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
