#!/bin/sh
# Restore ambagan from one of its backups (Docker Compose deployment).
#
#   scripts/restore.sh                      list the backups
#   scripts/restore.sh 2026-10-19T19-31-39  restore that one
#
# What it does, in order: stops the app; checks the backup is a healthy ambagan database (and not from a newer
# version) BEFORE touching anything; moves the current database and QR images into /data/restore-safety/<time>/
# (nothing is deleted, so a mistaken restore can be undone); puts the backup in place; starts the app and waits for
# its health check. If anything fails before the old data has been replaced it says so and starts the app again; if
# the copy itself fails it puts the old data back first.
# It runs inside the app's own image as its normal non-root user, so ownership and permissions come out right.
set -eu

cd "$(dirname "$0")/.."
COMPOSE="docker compose"

if [ $# -eq 0 ]; then
  echo "Available backups (newest first):"
  $COMPOSE run --rm --no-deps -T --entrypoint sh app -c 'ls -1 "${BACKUP_DIR:-/data/backups}" 2>/dev/null | grep -E "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}$" | sort -r || true'
  echo
  echo "Restore one with: scripts/restore.sh <name>"
  exit 0
fi

NAME="$1"
case "$NAME" in
  [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
  *) echo "'$NAME' is not a backup name (expected like 2026-10-19T19-31-39). Run without arguments to list them." >&2; exit 2 ;;
esac

echo "Stopping the app..."
$COMPOSE stop app

echo "Checking the backup, then restoring it..."
# Exit codes from the container: 10 = refused before anything changed, 11 = the copy failed and the old data was put
# back. Both (and docker itself failing to run the container: 125-127) mean nothing changed, so the app is started
# again. Anything else may have left data half-moved, so the app is NOT started on its own (it would create an empty
# database); the message says where the old data is.
status=0
$COMPOSE run --rm --no-deps -T -e RESTORE_NAME="$NAME" --entrypoint sh app -c '
  set -eu
  umask 077   # the safety copy holds member data: private to the app user
  src="${BACKUP_DIR:-/data/backups}/$RESTORE_NAME"
  [ -f "$src/ambagan.db" ] || { echo "No such backup: $src" >&2; exit 10; }

  # 1. The backup must be a healthy ambagan database from this version or older. Nothing has been changed yet.
  sqlite=$(ls -d /app/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 2>/dev/null | head -1 || true)
  node -e "
    try {
      let D;
      try { D = require(\"better-sqlite3\"); } catch (e) {
        if (!process.argv[1]) throw new Error(\"could not load SQLite in this image\");
        D = require(process.argv[1]);
      }
      const fs = require(\"fs\");
      const db = new D(process.argv[2], { readonly: true, fileMustExist: true });
      const r = db.pragma(\"integrity_check\");
      if (r.length !== 1 || r[0].integrity_check !== \"ok\") throw new Error(\"it failed SQLite\x27s integrity check\");
      const t = new Set(db.prepare(\"select name from sqlite_master where type = \x27table\x27\").all().map((x) => x.name));
      if (![\"user\", \"statement\", \"payment\", \"__drizzle_migrations\"].every((n) => t.has(n))) throw new Error(\"it is not an ambagan database\");
      const applied = db.prepare(\"select max(created_at) as m from __drizzle_migrations\").get().m || 0;
      const known = Math.max(...JSON.parse(fs.readFileSync(\"/app/drizzle/meta/_journal.json\", \"utf8\")).entries.map((e) => e.when));
      if (applied > known) throw new Error(\"it was made by a newer version of ambagan than this one\");
      console.log(\"Backup is healthy.\");
    } catch (e) {
      console.error(\"This backup is damaged or not usable: \" + e.message);
      process.exit(10);
    }
  " "$sqlite" "$src/ambagan.db"

  # 2. Keep what is there now, then put the backup in place. Every step is checked; on any failure the old data is put back.
  safety="/data/restore-safety/$(date +%Y%m%dT%H%M%S)"
  created_db=0
  created_assets=0

  put_back() {
    [ -e /data/ambagan.db.restoring ] && rm -f /data/ambagan.db.restoring
    [ "$created_db" = 1 ] && rm -f /data/ambagan.db
    [ "$created_assets" = 1 ] && rm -rf /data/assets
    for f in ambagan.db ambagan.db-wal ambagan.db-shm; do [ -e "$safety/$f" ] && mv "$safety/$f" "/data/$f"; done
    [ -d "$safety/assets" ] && mv "$safety/assets" /data/assets
    rmdir "$safety" 2>/dev/null || true
    return 0
  }

  swap() {
    mkdir -p "$safety" || return 1
    for f in ambagan.db ambagan.db-wal ambagan.db-shm; do
      if [ -e "/data/$f" ]; then mv "/data/$f" "$safety/" || return 1; fi
    done
    if [ -d /data/assets ]; then mv /data/assets "$safety/assets" || return 1; fi
    cp "$src/ambagan.db" /data/ambagan.db.restoring || return 1
    chmod 600 /data/ambagan.db.restoring || return 1
    mv /data/ambagan.db.restoring /data/ambagan.db || return 1
    created_db=1
    if [ -d "$src/assets" ]; then
      created_assets=1
      cp -R "$src/assets" /data/assets || return 1
    fi
    return 0
  }

  if swap; then
    echo "Current data kept in $safety"
    echo "Restored $RESTORE_NAME."
  else
    echo "The copy failed; putting your previous data back." >&2
    put_back
    exit 11
  fi
' || status=$?

case "$status" in
  0) ;;
  10|11|125|126|127)
    echo "Nothing was changed. Starting the app again on its current data..." >&2
    $COMPOSE up -d app >/dev/null
    exit 1
    ;;
  *)
    echo "The restore stopped part-way (exit $status). The app was NOT started. Your previous data is in /data/restore-safety/ on the volume." >&2
    exit 1
    ;;
esac

echo "Starting the app..."
$COMPOSE up -d app
i=0
until [ "$($COMPOSE ps --format '{{.Health}}' app)" = "healthy" ]; do
  i=$((i + 1))
  if [ "$i" -gt 40 ]; then echo "The app did not become healthy. Check: docker compose logs app" >&2; exit 1; fi
  sleep 3
done
echo "Done: the app is healthy on the restored data."
