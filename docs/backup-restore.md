# Backups and restore

Everything that matters is in two places on the `/data` volume: the SQLite database (members, statements, payments, the email log) and the uploaded QR images. ambagan backs up both **every day, from inside the app**, and you can restore from any backup with one script.

## What a backup is

Each backup is a folder `backups/<time>/` (named for the Manila time it was taken, e.g. `2026-10-19T19-31-39`) holding:

- `ambagan.db`: a complete, self-contained copy of the database. It is taken with SQLite's online backup API, so it is safe while the app is running and includes changes that haven't yet been folded into the main file. The copy is switched to a single-file format (no `-wal`/`-shm` companions to forget).
- `assets/`: a copy of the QR images, if any.

Before a backup counts, it is **verified**: SQLite's own integrity check must pass and the copy must contain ambagan's tables. It is written to a temporary folder first and renamed into place only when it passes, so an interrupted or failed backup never looks like a good one (and leaves nothing behind). Folders and files are private to the app's user (`0700` / `0600`), because a backup holds member emails, names and payment references. **Sign-in sessions and pending sign-in links are left out** of every backup (they are live credentials), so a copy that leaks is not a set of working logins.

## Schedule, rotation and settings

- The scheduler takes one backup per Manila day, at the first tick after 08:00, **before** that day's statement run, so there is always a snapshot from before the day's changes. If the app was off at 08:00 it catches up when it starts. A failed run is retried after 30 minutes and shown on **Admin → Settings → Backups**.
- **Back up now** on that page takes one immediately (do this before anything risky). It can't overlap another backup.
- The newest `BACKUP_KEEP` backups are kept (default 14); older ones are deleted after a successful new one, and at least one is always kept. If an old folder can't be deleted (for example one you restored by hand as another user) the new backup still counts as successful and the problem is logged. The backup folder should be dedicated to ambagan: leftover `.tmp-*` entries in it are treated as debris from a crashed backup and removed.
- **Back up now** is refused for 5 minutes after the last backup, so repeated clicks can't push the daily history out.
- `BACKUP_DIR` chooses the folder (default: `backups` next to the database, i.e. `/data/backups`).

The admin page lists backups but deliberately offers **no download**: a backup is a complete copy of every member's data and sessions, so it is never served over the web. Copy it with host tools (below).

## Get a copy off the machine (important)

Backups in `/data/backups` sit on the same disk as the live data. They protect you from a bad update, a mistaken edit or a corrupted database, but **not** from losing the server or the volume. Copy them somewhere else on a schedule.

The simplest setup is to give the container a host folder for backups. In `compose.yaml`, uncomment the `/srv/ambagan-backups` volume line and set `BACKUP_DIR=/backups` in `.env`, then:

```bash
sudo mkdir -p /srv/ambagan-backups && sudo chown 1000:1000 /srv/ambagan-backups && sudo chmod 700 /srv/ambagan-backups
docker compose up -d
```

Now copy that folder off the machine from the host, for example daily with `rclone` or `rsync` to another server or cloud storage:

```cron
30 9 * * *  rclone copy /srv/ambagan-backups remote:ambagan-backups --immutable
```

Keep the copy private (it contains personal data) and encrypted at the destination. Every backup folder is self-contained, so you only need the newest one or two to recover.

## Restore

Restoring replaces the live data with a backup. Run it on the Docker host, from the project folder:

```bash
scripts/restore.sh                       # list the backups
scripts/restore.sh 2026-10-19T19-31-39   # restore that one
```

The script, in order: stops the app; **checks the chosen backup is healthy before changing anything** (if not, it says why, changes nothing and starts the app again); moves the current database and images to `/data/restore-safety/<time>/` (nothing is deleted, so a mistaken restore can be undone by moving them back); puts the backup in place; starts the app and waits for the health check. It runs as the app's own user, so permissions come out right with no `chown`.

Things to know:

- Anything that happened after the backup is lost: payments reported, approvals, emails queued. If members paid in that window, they'll need to report again (check **Emails** and ask in your group).
- **Everyone has to sign in again** after a restore (sessions aren't in backups), including you: use the sign-in link on the login page. Sign-in links requested before the restore stop working.
- The email queue is part of the database, so emails queued or sent after the backup are rewound: some already-sent messages may be sent again, and ones queued after it are gone. Check the **Emails** page right after restoring.
- A backup from an older version of ambagan is upgraded automatically when the app starts (migrations run at startup). A backup from a *newer* version is refused by the script.
- If the copy step fails (disk full, permissions), the script puts your previous data back and starts the app again. If it is interrupted by something else, the app is left stopped and the message says where your previous data is.
- To restore from a copy you keep elsewhere, put the folder back into `/data/backups` (or your `BACKUP_DIR`) first, then run the script.
- `restore-safety` folders are never cleaned up automatically; delete old ones once you're sure. They are kept private to the app's user (mode 700) because, unlike regular backups, they still hold live sign-in sessions.
- To undo a restore: stop the app, move the files from `/data/restore-safety/<time>/` back to `/data`, start it.

### Practise it

Do this once on a copy of your setup before you need it: take a backup, change or delete something, run `scripts/restore.sh <name>`, and confirm the data is back. It was drilled this way during development: data deleted from a running container, restored from a UI-triggered backup, counts matched, and a deliberately corrupted backup was refused without touching the live data.

## Limits

- Daily backups mean you can lose up to a day of changes. **Back up now** narrows that for planned risky work.
- Every backup, including each **Back up now**, counts toward the `BACKUP_KEEP` newest: pressing the button many times pushes your older backups out. Raise `BACKUP_KEEP` if you take many by hand.
- Each backup is a full copy (the database is small, a few hundred KB at this scale), so 14 of them are cheap, but there is no free-space check: keep an eye on the volume if you raise `BACKUP_KEEP` a lot.
- The restore script drives Docker Compose and needs a shell on the host; there is no restore button in the web UI on purpose.
