# ambagan

Self-hosted payment portal for shared subscriptions among friends: monthly statements of account, payment submission with in-browser receipt OCR, admin verification, and email reminders.

Stack: Next.js (App Router), TypeScript, Tailwind, shadcn/ui, SQLite + Drizzle, Auth.js, Nodemailer, Tesseract.js, Docker Compose.

## Run it with Docker

```bash
cp .env.example .env     # set AUTH_SECRET (openssl rand -base64 32), ADMIN_EMAIL, APP_URL and SMTP_*
docker compose up -d --build
```

One container, one volume, no other services. See [docs/deployment.md](docs/deployment.md) for the reverse proxy, security headers, updating and troubleshooting, and [docs/backup-restore.md](docs/backup-restore.md) for daily backups and restoring.

## Development

```bash
nvm use            # Node 22
pnpm install
cp .env.example .env   # fill AUTH_SECRET and ADMIN_EMAIL
pnpm dev
```

Checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

Decisions and issues are tracked in [PROJECT_LOG.md](PROJECT_LOG.md).
