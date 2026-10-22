import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "@/server/db/client";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("the database file is private to the app's own user", () => {
  it("is created readable and writable by its owner only, and so are its write-ahead files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ambagan-perm-"));
    dirs.push(dir);
    const file = path.join(dir, "ambagan.db");
    const db = openDb(file);
    db.$client.exec("create table t (x integer); insert into t values (1);");

    for (const name of ["ambagan.db", "ambagan.db-wal", "ambagan.db-shm"]) {
      const target = path.join(dir, name);
      if (!fs.existsSync(target)) continue;
      expect(fs.statSync(target).mode & 0o077, `${name} must not be readable by group or others`).toBe(0);
    }
    expect(fs.existsSync(file)).toBe(true);
    db.$client.close();
  });

  it("tightens a database file that an older version created world-readable", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ambagan-perm-"));
    dirs.push(dir);
    const file = path.join(dir, "ambagan.db");
    openDb(file).$client.close();
    fs.chmodSync(file, 0o644);
    openDb(file).$client.close();
    expect(fs.statSync(file).mode & 0o077).toBe(0);
  });
});
