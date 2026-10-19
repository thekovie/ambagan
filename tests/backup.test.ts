import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupDirFor, backupTooRecent, createBackup, listBackups, pruneBackups, verifyBackupFile } from "@/server/backup/backup";
import { closeDb, migrateDb, openDb, type Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { checkHealth } from "@/server/health";

// Manila is UTC+8: this instant is 2026-10-19 19:31:39 there.
const NOW = new Date("2026-10-19T11:31:39Z");
const NAME = "2026-10-19T19-31-39";

let root: string;
let dbFile: string;
let assetsDir: string;
let backupsDir: string;
let db: Db;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ambagan-backup-"));
  dbFile = path.join(root, "live.db");
  assetsDir = path.join(root, "assets");
  backupsDir = path.join(root, "backups");
  db = openDb(dbFile);
  migrateDb(db);
});

afterEach(() => {
  try {
    closeDb(db);
  } catch {
    // already closed by the test
  }
  fs.rmSync(root, { recursive: true, force: true });
});

const addUser = (email: string) => db.insert(s.users).values({ email, name: email.split("@")[0] }).run();
const mkBackupDir = (name: string) => {
  fs.mkdirSync(path.join(backupsDir, name), { recursive: true });
  fs.writeFileSync(path.join(backupsDir, name, "ambagan.db"), "x");
};

describe("createBackup", () => {
  it("writes a verified copy of the database into a timestamped folder (Manila time)", async () => {
    addUser("ana@example.com");
    const info = await createBackup(db, { dir: backupsDir, assetsDir, now: NOW, keep: 14 });
    expect(info.name).toBe(NAME);
    expect(info.sizeBytes).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(backupsDir, NAME, "ambagan.db"))).toBe(true);
  });

  it("includes data that is still in the write-ahead log, and the copy opens as a working database", async () => {
    addUser("ana@example.com");
    expect(fs.statSync(`${dbFile}-wal`).size).toBeGreaterThan(0); // not yet folded into the main file
    await createBackup(db, { dir: backupsDir, assetsDir, now: NOW, keep: 14 });

    const copy = openDb(path.join(backupsDir, NAME, "ambagan.db"));
    expect(copy.$client.prepare("SELECT email FROM user").all()).toEqual([{ email: "ana@example.com" }]);
    expect(checkHealth(copy)).toEqual({ ok: true, database: "ok" });
    closeDb(copy);
  });

  it("copies uploaded QR images, and is fine when there are none", async () => {
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, "abc123.png"), "png-bytes");
    await createBackup(db, { dir: backupsDir, assetsDir, now: NOW, keep: 14 });
    expect(fs.readFileSync(path.join(backupsDir, NAME, "assets", "abc123.png"), "utf8")).toBe("png-bytes");

    const emptyDir = path.join(root, "backups2");
    await createBackup(db, { dir: emptyDir, assetsDir: path.join(root, "nope"), now: NOW, keep: 14 });
    expect(fs.existsSync(path.join(emptyDir, NAME, "ambagan.db"))).toBe(true);
  });

  it("keeps the backup private to the app's user", async () => {
    await createBackup(db, { dir: backupsDir, assetsDir, now: NOW, keep: 14 });
    expect(fs.statSync(path.join(backupsDir, NAME)).mode & 0o077).toBe(0);
    expect(fs.statSync(path.join(backupsDir, NAME, "ambagan.db")).mode & 0o077).toBe(0);
  });

  it("leaves nothing half-written behind when it fails", async () => {
    closeDb(db); // the source is gone, so the copy cannot be made
    await expect(createBackup(db, { dir: backupsDir, assetsDir, now: NOW, keep: 14 })).rejects.toThrow();
    expect(fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir) : []).toEqual([]);
  });

  it("cleans up half-written copies left behind by an earlier crash", async () => {
    const stale = path.join(backupsDir, ".tmp-2026-01-01T00-00-00");
    fs.mkdirSync(stale, { recursive: true });
    fs.writeFileSync(path.join(stale, "ambagan.db"), "half a database");
    fs.writeFileSync(path.join(backupsDir, "notes.txt"), "not ours, must survive");

    await createBackup(db, { dir: backupsDir, assetsDir, now: NOW, keep: 14 });

    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.readFileSync(path.join(backupsDir, "notes.txt"), "utf8")).toBe("not ours, must survive");
    expect(listBackups(backupsDir).map((b) => b.name)).toEqual([NAME]);
  });

  it("is not fooled by running twice in the same second (no overwrite, no crash)", async () => {
    await createBackup(db, { dir: backupsDir, assetsDir, now: NOW, keep: 14 });
    await expect(createBackup(db, { dir: backupsDir, assetsDir, now: NOW, keep: 14 })).rejects.toThrow(/already exists/);
    expect(listBackups(backupsDir)).toHaveLength(1);
  });

  it("applies rotation after a successful backup", async () => {
    for (const day of ["01", "02", "03"]) mkBackupDir(`2026-09-${day}T08-00-00`);
    const info = await createBackup(db, { dir: backupsDir, assetsDir, now: NOW, keep: 2 });
    expect(listBackups(backupsDir).map((b) => b.name)).toEqual([NAME, "2026-09-03T08-00-00"]);
    expect(info.pruned).toEqual(["2026-09-02T08-00-00", "2026-09-01T08-00-00"]);
  });
});

describe("what a backup leaves out and survives", () => {
  it("does not contain sign-in sessions or pending sign-in links (they are live credentials)", async () => {
    const user = db.insert(s.users).values({ email: "ana@example.com" }).returning().get();
    db.insert(s.sessions).values({ sessionToken: "live-bearer-token", userId: user.id, expires: new Date("2027-01-01") }).run();
    db.insert(s.verificationTokens).values({ identifier: "ana@example.com", token: "hashed-link", expires: new Date("2027-01-01") }).run();

    await createBackup(db, { dir: backupsDir, assetsDir, now: NOW, keep: 14 });

    const copy = openDb(path.join(backupsDir, NAME, "ambagan.db"));
    expect(copy.$client.prepare("SELECT count(*) n FROM session").get()).toEqual({ n: 0 });
    expect(copy.$client.prepare("SELECT count(*) n FROM \"verificationToken\"").get()).toEqual({ n: 0 });
    expect(copy.$client.prepare("SELECT count(*) n FROM user").get()).toEqual({ n: 1 });
    closeDb(copy);
    // ...while the live database keeps them.
    expect(db.$client.prepare("SELECT count(*) n FROM session").get()).toEqual({ n: 1 });
  });

  it.skipIf(process.getuid?.() === 0)("still succeeds, and says so, when an old backup can't be deleted by rotation", async () => {
    mkBackupDir("2026-09-01T08-00-00");
    const locked = path.join(backupsDir, "2026-09-01T08-00-00", "locked");
    fs.mkdirSync(locked);
    fs.writeFileSync(path.join(locked, "f"), "x");
    fs.chmodSync(locked, 0o500); // contents can't be removed
    try {
      const info = await createBackup(db, { dir: backupsDir, assetsDir, now: NOW, keep: 1 });
      expect(info.name).toBe(NAME);
      expect(info.pruned).toEqual([]);
      expect(info.pruneError).toBeTruthy();
      expect(fs.existsSync(path.join(backupsDir, NAME, "ambagan.db"))).toBe(true);
    } finally {
      fs.chmodSync(locked, 0o700);
    }
  });
});

describe("backupTooRecent (cooldown for manual backups)", () => {
  const five = 5 * 60_000;
  it("is true when the newest backup is younger than the window", () => {
    const backups = [{ name: "x", createdAt: new Date(NOW.getTime() - 60_000), sizeBytes: 1 }];
    expect(backupTooRecent(backups, NOW, five)).toBe(true);
  });
  it("is false when it is older, or when there are none", () => {
    expect(backupTooRecent([{ name: "x", createdAt: new Date(NOW.getTime() - five - 1000), sizeBytes: 1 }], NOW, five)).toBe(false);
    expect(backupTooRecent([], NOW, five)).toBe(false);
  });
});

describe("verifyBackupFile", () => {
  it("accepts a real database", async () => {
    await createBackup(db, { dir: backupsDir, assetsDir, now: NOW, keep: 14 });
    expect(() => verifyBackupFile(path.join(backupsDir, NAME, "ambagan.db"))).not.toThrow();
  });

  it("rejects a file that is not a database", () => {
    const junk = path.join(root, "junk.db");
    fs.writeFileSync(junk, "this is not sqlite");
    expect(() => verifyBackupFile(junk)).toThrow();
  });

  it("rejects a valid SQLite file that is not ours (no schema)", () => {
    const other = openDb(path.join(root, "other.db"));
    other.$client.exec("CREATE TABLE unrelated (x)");
    closeDb(other);
    expect(() => verifyBackupFile(path.join(root, "other.db"))).toThrow(/not an ambagan database/);
  });

  it("rejects a truncated copy", async () => {
    addUser("ana@example.com");
    await createBackup(db, { dir: backupsDir, assetsDir, now: NOW, keep: 14 });
    const file = path.join(backupsDir, NAME, "ambagan.db");
    fs.truncateSync(file, Math.floor(fs.statSync(file).size / 2));
    expect(() => verifyBackupFile(file)).toThrow();
  });
});

describe("listBackups / pruneBackups", () => {
  it("lists newest first and ignores anything that is not a backup folder", () => {
    mkBackupDir("2026-10-01T08-00-00");
    mkBackupDir("2026-10-03T08-00-00");
    mkBackupDir("2026-10-02T08-00-00");
    fs.mkdirSync(path.join(backupsDir, "notes"));
    fs.writeFileSync(path.join(backupsDir, "README.txt"), "hi");
    fs.mkdirSync(path.join(backupsDir, ".tmp-2026-10-04T08-00-00"));
    expect(listBackups(backupsDir).map((b) => b.name)).toEqual(["2026-10-03T08-00-00", "2026-10-02T08-00-00", "2026-10-01T08-00-00"]);
  });

  it("does not count a folder without a database in it (an interrupted copy is not a backup)", () => {
    mkBackupDir("2026-10-01T08-00-00");
    fs.mkdirSync(path.join(backupsDir, "2026-10-02T08-00-00"));
    expect(listBackups(backupsDir).map((b) => b.name)).toEqual(["2026-10-01T08-00-00"]);
  });

  it("lists nothing when the folder doesn't exist yet", () => {
    expect(listBackups(path.join(root, "never-made"))).toEqual([]);
  });

  it("deletes only the oldest backup folders and never touches other files", () => {
    for (const day of ["01", "02", "03", "04"]) mkBackupDir(`2026-10-${day}T08-00-00`);
    fs.writeFileSync(path.join(backupsDir, "keep-me.txt"), "x");
    expect(pruneBackups(backupsDir, 2)).toEqual(["2026-10-02T08-00-00", "2026-10-01T08-00-00"]);
    expect(fs.readdirSync(backupsDir).sort()).toEqual(["2026-10-03T08-00-00", "2026-10-04T08-00-00", "keep-me.txt"]);
  });

  it("never prunes below one backup", () => {
    mkBackupDir("2026-10-01T08-00-00");
    expect(pruneBackups(backupsDir, 0)).toEqual([]);
    expect(listBackups(backupsDir)).toHaveLength(1);
  });
});

describe("backupDirFor", () => {
  it("defaults to a backups folder next to the database", () => {
    expect(backupDirFor({ DATABASE_PATH: "/data/ambagan.db" })).toBe("/data/backups");
  });
  it("uses BACKUP_DIR when it is set", () => {
    expect(backupDirFor({ DATABASE_PATH: "/data/ambagan.db", BACKUP_DIR: "/mnt/other-disk/ambagan" })).toBe("/mnt/other-disk/ambagan");
  });
});
