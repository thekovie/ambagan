# Deployment

ambagan runs as **one container**: the web app, the scheduler and the email sender share a process, and the SQLite database and uploaded QR images live on one volume. No other service is needed. It was measured at about **52 MiB of memory at idle** and a **443 MB image**.

## First deploy

```bash
git clone <your repo> ambagan && cd ambagan
cp .env.example .env          # then edit it, see below
docker compose up -d --build
docker compose ps             # wait for "healthy"
```

Open the app, enter the `ADMIN_EMAIL` address on the sign-in page, and use the emailed link: that address becomes the first administrator. Then add members under **Members**, set your payment accounts under **Settings**, and press **Send me a test email** under **Emails** to confirm SMTP works.

### Environment (`.env`)

| Variable | Notes |
|---|---|
| `APP_URL` | The public address, e.g. `https://pay.example.com`. Used for links in emails, and sign-in is pinned to it. **Must be `https` in production** (the app refuses to start otherwise; `http://localhost` is allowed for trying it out). |
| `AUTH_SECRET` | `openssl rand -base64 32`. Keep it; changing it signs everyone out. |
| `ADMIN_EMAIL` | The first administrator. |
| `SMTP_*` | Required in production. See [email.md](email.md). |
| `BACKUP_DIR`, `BACKUP_KEEP` | Optional: where daily backups go (default `/data/backups`) and how many to keep (default 14). See [backup-restore.md](backup-restore.md). |

`DATABASE_PATH` and `ASSETS_DIR` are fixed to the `/data` volume by `compose.yaml`.

The container **refuses to start** (exit code 1, reason in `docker compose logs`) if a required value is missing or invalid, instead of coming up broken. `restart: unless-stopped` keeps retrying, so fix `.env` and run `docker compose up -d`.

## What the compose file does

- Binds the port to `127.0.0.1:3000` only: put a TLS reverse proxy in front (below). Do not expose port 3000 to the internet directly.
- Runs as a non-root user with a read-only root filesystem (`/data` and `/tmp` are the only writable places), all capabilities dropped and `no-new-privileges`.
- `init: true` and a 20 s stop grace period: `docker compose stop` sends SIGTERM, Next finishes in-flight requests, and the app folds the SQLite write-ahead log into the database file on exit.
- Health check: `GET /api/health` returns `{"status":"ok","database":"ok"}` (HTTP 200) when the database answers and has its schema, and 503 otherwise. It is unauthenticated and deliberately says nothing more. `docker compose ps` shows the result.
- Limits: 512 MiB memory (idle use is about a tenth of that), no extra swap, 256 processes, a 64 MB `noexec` `/tmp`.
- `.env` holds secrets and is visible via `docker inspect`: `chmod 600 .env` and keep it out of backups you share.

## Backups

The app backs up the database and QR images itself every day and keeps the latest 14; `scripts/restore.sh` restores one. Read [backup-restore.md](backup-restore.md), especially "Get a copy off the machine": backups on the same disk don't protect against losing the server.

## Reverse proxy and TLS

Any TLS-terminating proxy works. The requirements:

1. **Forward the original `Host` and set `X-Forwarded-For`.** Rate limiting trusts the **last** `X-Forwarded-For` entry, which is what exactly one proxy in front adds. Do not stack a second proxy that doesn't overwrite it: with a CDN in front of your proxy (Cloudflare plus Caddy, say) the last entry is the CDN, every visitor shares a few rate-limit buckets and they limit each other. An IPv6 visitor counts as their whole /64 block.
2. **Allow request bodies of at least 2 MB** (QR image uploads; many proxies default to 1 MB).
3. Serve the app only over HTTPS and keep `APP_URL` in sync with the public address.

Caddy (automatic certificates):

```caddyfile
pay.example.com {
    header Strict-Transport-Security "max-age=31536000"
    respond /api/health 404        # the container checks itself on 127.0.0.1; no need to publish it
    reverse_proxy 127.0.0.1:3000
}
```

nginx (inside your TLS `server` block):

```nginx
client_max_body_size 2m;
add_header Strict-Transport-Security "max-age=31536000" always;
location = /api/health { return 404; }   # the container checks itself on 127.0.0.1
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;   # overwrite, don't append a client-supplied value
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Private share links at the proxy

Some URLs are credentials: private links (`/s/<token>` and `/api/s/<token>/...`), invitations (`/invite/<token>`) and the sign-in link callback (`/api/auth/callback/...?token=...`). At the reverse proxy, (1) limit request bodies to about 64 KB everywhere except `/admin/settings` (the app's 2 MB limit is only for admin QR uploads, but it also applies to the public sign-in and invitation actions), and (2) leave those paths out of access logs. The app already sends `Referrer-Policy: same-origin`, `X-Robots-Tag: noindex` and `Cache-Control: no-store` for them. Rotating `AUTH_SECRET` signs everyone out and invalidates every private link.

## Security headers

Every page gets `Strict-Transport-Security` (ignored over plain http) and a **Content-Security-Policy with a fresh nonce** (`src/proxy.ts`): scripts only run with that nonce, nothing loads from another origin, framing is denied, and forms may only post to the app itself. Two allowances are needed on purpose: `'wasm-unsafe-eval'` and `worker-src blob:`, so the receipt scanner (Tesseract running WebAssembly in a worker, entirely in the browser) works; and inline styles, because React sets style attributes. `upgrade-insecure-requests` is added only when `APP_URL` is `https`. The OCR files are served from the app itself, never a CDN. Also set: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. QR images are served with their own sandboxing CSP and are not cached by shared caches.

If you add a third-party script or font later, it will be blocked until you add its origin in `src/lib/csp.ts`.

## Updating

```bash
git pull
docker compose up -d --build   # migrations run automatically at start
```

The database lives on the `ambagan-data` volume, so rebuilding or recreating the container keeps it (verified: identical data after `docker compose down` and `up`). **`docker compose down -v` deletes the volume.** Take a backup first (**Admin → Settings → Back up now**).

**Rolling back a version that changed the database.** Migrations only add to the schema and are never undone. An older image started on a newer database can fail (for example, the version before ambag bills cannot generate monthly statements once the bills migration has run, because its duplicate guard targets an index that no longer exists in that form). So rolling back means restoring the backup you took before the update (see [backup-restore.md](backup-restore.md)), then starting the older image. The migration that added ambag bills (`drizzle/0002_*.sql`) is additive only (one new table, a few new columns, and a replaced index), and a test (`tests/migration-0002.test.ts`) proves that data already in the database survives it unchanged.

## Troubleshooting

| Symptom | Look at |
|---|---|
| Container restarting | `docker compose logs app`: "ambagan could not start: Invalid environment" names the missing variable. |
| `unhealthy` | `docker compose logs app`; check the volume is writable and the disk isn't full. Docker does not restart an unhealthy container by itself: `docker compose restart app` (or add an autoheal sidecar). |
| Sign-in emails never arrive | **Emails** page: the log shows the SMTP error; use the test button. |
| Everyone is rate limited / shares one limit | The proxy isn't sending `X-Forwarded-For`. |
| QR upload fails with a body-size error | The proxy's body limit is under 2 MB. |
| Links in emails point to `localhost` | `APP_URL` is wrong. |

## Notes

- The image is built with `node:22-bookworm-slim` (glibc) because `better-sqlite3` ships a prebuilt binary for it; no compiler is needed.
- Server Actions use an encryption key generated at build time. After a rebuild, a form left open in a tab from before it may need a reload.
- Verified with Docker (OrbStack) on arm64. The CI job builds the image on amd64 and checks the health endpoint.
