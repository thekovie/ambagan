import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { APP_TIMEZONE } from "@/server/billing/period";
import type { Db } from "@/server/db/client";

const DB_FILE = "ambagan.db";
const ASSETS_DIR = "assets";
const BACKUP_NAME = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;
const PRIVATE_DIR = 0o700;
const PRIVATE_FILE = 0o600;

export interface BackupInfo {
  /** Folder name, the Manila time it was taken: "2026-10-19T19-31-39". Sorts oldest to newest. */
  name: string;
  createdAt: Date;
  sizeBytes: number;
}

export interface CreatedBackup extends BackupInfo {
  /** Older backups removed by rotation. */
  pruned: string[];
  /** Set when rotation could not remove something. The new backup is still good; this is a warning. */
  pruneError?: string;
}

/** A hand-started backup is refused when the newest one is younger than this (each one counts toward rotation). */
export const MANUAL_BACKUP_COOLDOWN_MS = 5 * 60_000;

/** True when the newest backup is younger than `windowMs`. `backups` is newest first, as `listBackups` returns it. */
export function backupTooRecent(backups: BackupInfo[], now: Date, windowMs: number): boolean {
  return backups.length > 0 && now.getTime() - backups[0].createdAt.getTime() < windowMs;
}

/** Where backups are written: BACKUP_DIR, else a `backups` folder beside the database. */
export function backupDirFor(env: { DATABASE_PATH: string; BACKUP_DIR?: string }): string {
  return path.resolve(/*turbopackIgnore: true*/ env.BACKUP_DIR ?? path.join(path.dirname(env.DATABASE_PATH), "backups"));
}

function backupName(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}-${part("minute")}-${part("second")}`;
}

function parseBackupName(name: string): Date {
  return new Date(`${name.replace(/T(\d\d)-(\d\d)-(\d\d)$/, "T$1:$2:$3")}+08:00`); // Manila has no DST
}

/**
 * Proves a copy is usable before it is trusted: SQLite says it is intact, and it has our schema. Throws if not.
 * The copy is opened read-only; backups are stored in rollback-journal mode, so no side files are created.
 */
export function verifyBackupFile(file: string): void {
  const copy = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const result = copy.pragma("integrity_check") as { integrity_check: string }[];
    if (result.length !== 1 || result[0].integrity_check !== "ok") {
      throw new Error(`Backup failed its integrity check: ${result.map((r) => r.integrity_check).join("; ").slice(0, 200)}`);
    }
    const tables = new Set((copy.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name));
    if (!tables.has("user") || !tables.has("statement") || !tables.has("payment")) throw new Error("Backup is not an ambagan database");
  } finally {
    copy.close();
  }
}

/** Backups, newest first. Anything that isn't a backup (notes, half-written `.tmp-` copies, folders without a database) is ignored. */
export function listBackups(dir: string): BackupInfo[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && BACKUP_NAME.test(entry.name) && fs.existsSync(path.join(dir, entry.name, DB_FILE)))
    .map((entry) => {
      const dbFile = path.join(dir, entry.name, DB_FILE);
      return { name: entry.name, createdAt: parseBackupName(entry.name), sizeBytes: fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0 };
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

/** Rotation: removes the oldest backups beyond `keep` (never fewer than one is kept). Returns what it removed. */
export function pruneBackups(dir: string, keep: number): string[] {
  const doomed = listBackups(dir).slice(Math.max(keep, 1));
  for (const backup of doomed) fs.rmSync(path.join(dir, backup.name), { recursive: true, force: true });
  return doomed.map((b) => b.name);
}

/**
 * Takes an online backup with SQLite's backup API, which is safe while the app keeps writing and includes
 * whatever is still in the write-ahead log. The copy is written to a temporary folder, verified, and only then
 * renamed into place, so a failed or interrupted backup never looks like a good one. Uploaded QR images are
 * copied alongside. Everything is private to the app's user: it holds member data.
 */
export async function createBackup(
  db: Db,
  options: { dir: string; assetsDir: string; now: Date; keep: number },
): Promise<CreatedBackup> {
  const { dir, assetsDir, now, keep } = options;
  const name = backupName(now);
  const finalDir = path.join(dir, name);
  if (fs.existsSync(finalDir)) throw new Error(`Backup ${name} already exists`);

  fs.mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR });
  // A crash mid-backup leaves a `.tmp-` folder behind. Backups never overlap (the job runner allows one at a
  // time), so anything with that prefix is garbage from an earlier attempt.
  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith(".tmp-")) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
  const tmpDir = path.join(dir, `.tmp-${name}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { mode: PRIVATE_DIR });

  const dbCopy = path.join(tmpDir, DB_FILE);
  try {
    await db.$client.backup(dbCopy);
    // A single self-contained file: no -wal/-shm companions to lose or forget when copying it elsewhere.
    const copy = new Database(dbCopy);
    copy.pragma("journal_mode = DELETE");
    // Sessions and pending sign-in links are live credentials. Backups don't need them (everyone just signs in again
    // after a restore), and an off-machine copy must not be a set of working logins. VACUUM so the removed rows
    // don't linger in free pages of the file.
    copy.exec('DELETE FROM "session"; DELETE FROM "verificationToken"; VACUUM;');
    copy.close();
    fs.chmodSync(dbCopy, PRIVATE_FILE);
    verifyBackupFile(dbCopy);

    if (fs.existsSync(assetsDir)) {
      fs.cpSync(assetsDir, path.join(tmpDir, ASSETS_DIR), { recursive: true });
    }
    fs.renameSync(tmpDir, finalDir);
  } catch (error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }

  // Rotation is housekeeping: failing to delete an old folder (say, one restored by hand as another user) must not make
  // a good backup look failed, or the scheduler would retry and pile up more copies every half hour.
  let pruned: string[] = [];
  let pruneError: string | undefined;
  try {
    pruned = pruneBackups(dir, keep);
  } catch (error) {
    pruneError = error instanceof Error ? error.message : String(error);
  }
  return { name, createdAt: now, sizeBytes: fs.statSync(path.join(finalDir, DB_FILE)).size, pruned, ...(pruneError ? { pruneError } : {}) };
}
