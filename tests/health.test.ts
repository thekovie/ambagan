import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { closeDb, migrateDb, openDb } from "@/server/db/client";
import { checkHealth } from "@/server/health";
import { createTestDb } from "./helpers/db";

describe("checkHealth", () => {
  it("is healthy when the database answers and migrations are applied", () => {
    expect(checkHealth(createTestDb())).toEqual({ ok: true, database: "ok" });
  });

  it("is unhealthy, without leaking the reason, when the database is closed", () => {
    const db = createTestDb();
    db.$client.close();
    expect(checkHealth(db)).toEqual({ ok: false, database: "unavailable" });
  });

  it("is unhealthy when migrations have not been applied", () => {
    expect(checkHealth(openDb(":memory:"))).toEqual({ ok: false, database: "unavailable" });
  });
});

describe("closeDb (graceful shutdown)", () => {
  it("folds the write-ahead log into the main file before closing, so nothing is left behind", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ambagan-close-"));
    const file = path.join(dir, "test.db");
    try {
      const db = openDb(file);
      migrateDb(db);
      db.$client.exec("INSERT INTO setting (key, value) VALUES ('k', 'v')");
      expect(fs.statSync(`${file}-wal`).size).toBeGreaterThan(0);

      closeDb(db);

      expect(fs.existsSync(`${file}-wal`) ? fs.statSync(`${file}-wal`).size : 0).toBe(0);
      const reopened = openDb(file);
      expect(reopened.$client.prepare("SELECT value FROM setting WHERE key = 'k'").get()).toEqual({ value: "v" });
      reopened.$client.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
