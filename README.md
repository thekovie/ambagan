# ambagan

Self-hosted payment portal for shared subscriptions among friends: monthly statements of account, payment submission with in-browser receipt OCR, admin verification, and email reminders.

Stack: Next.js (App Router), TypeScript, Tailwind, shadcn/ui, SQLite + Drizzle, Auth.js, Nodemailer, Tesseract.js, Docker Compose.

## Development

```bash
nvm use            # Node 22
pnpm install
cp .env.example .env   # fill AUTH_SECRET and ADMIN_EMAIL
pnpm dev
```

Checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

Decisions and issues are tracked in [PROJECT_LOG.md](PROJECT_LOG.md).
