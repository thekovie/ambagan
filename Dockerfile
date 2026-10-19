# syntax=docker/dockerfile:1

# ---- base: Node 22 LTS with pnpm (version pinned by package.json "packageManager") ----
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /app

# ---- deps: install from the lockfile only (better-sqlite3 ships a prebuilt binary for linux) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# ---- build: `pnpm build` also copies the OCR engine into public/ocr (prebuild) ----
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---- runtime: the standalone server only, as a non-root user. App files stay root-owned (read-only to the app). ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/ambagan.db \
    ASSETS_DIR=/data/assets
WORKDIR /app

# /data holds the SQLite database, its WAL files and uploaded QR images: mount a volume here.
RUN mkdir -p /data && chown node:node /data

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Migrations are applied at startup from ./drizzle (relative to the working directory).
COPY --from=build /app/drizzle ./drizzle

USER node
EXPOSE 3000
VOLUME ["/data"]

# No curl in the slim image: use Node's own fetch against the unauthenticated health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
