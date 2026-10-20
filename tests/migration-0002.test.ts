import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { migrateDb, openDb, type Db } from "@/server/db/client";

const REAL = path.join(process.cwd(), "drizzle");
const JOURNAL = "meta/_journal.json";

/** A copy of the migrations folder that stops after the first `count` migrations: the app as it was before. */
function foldersUpTo(count: number): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "ambagan-migrations-"));
  fs.mkdirSync(path.join(folder, "meta"));
  const journal = JSON.parse(fs.readFileSync(path.join(REAL, JOURNAL), "utf8")) as { entries: { tag: string }[] };
  journal.entries = journal.entries.slice(0, count);
  fs.writeFileSync(path.join(folder, JOURNAL), JSON.stringify(journal));
  for (const { tag } of journal.entries) fs.copyFileSync(path.join(REAL, `${tag}.sql`), path.join(folder, `${tag}.sql`));
  return folder;
}

const all = (db: Db, sql: string) => db.$client.prepare(sql).all() as Record<string, unknown>[];
const run = (db: Db, sql: string, ...params: unknown[]) => db.$client.prepare(sql).run(...params);

const NOW = Date.UTC(2026, 9, 1);

/** Real-shaped data in the OLD schema: a plan, members, two statements, an approved and a pending payment, and email history. */
function seedOldDatabase(db: Db) {
  run(db, "insert into user (id, email, name, role) values ('admin', 'admin@example.com', 'Admin', 'ADMIN'), ('ana', 'ana@example.com', 'Ana', 'MEMBER')");
  run(db, "insert into subscription (id, name, ref_prefix, fee_minor) values ('spot', 'Spotify', 'SPOT', 7550)");
  run(db, "insert into membership (id, user_id, subscription_id, start_period) values ('m1', 'ana', 'spot', '2026-09')");
  run(db, "insert into payment_method (id, kind, label, account_name, account_number) values ('gcash', 'GCASH', 'GCash', 'Admin', '0917')");
  const statement = (id: string, period: string, status: string, outstanding: number) =>
    run(
      db,
      `insert into statement (id, reference, user_id, subscription_id, period, subscription_name, amount_minor, outstanding_minor, currency, issued_at, due_at, status)
       values (?, ?, 'ana', 'spot', ?, 'Spotify', 7550, ?, 'PHP', ?, ?, ?)`,
      id,
      `SPOT-${period.replace("-", "")}-AAAAAA`,
      period,
      outstanding,
      NOW,
      NOW + 9 * 864e5,
      status,
    );
  statement("st-sep", "2026-09", "PAID", 0);
  statement("st-oct", "2026-10", "UNDER_VERIFICATION", 7550);
  const payment = (id: string, statementId: string, status: string, ref: string) =>
    run(
      db,
      `insert into payment (id, statement_id, user_id, destination_method_id, sending_app, amount_minor, transaction_ref, transaction_ref_norm, transaction_date, status)
       values (?, ?, 'ana', 'gcash', 'Maya', 7550, ?, ?, ?, ?)`,
      id,
      statementId,
      ref,
      ref.replace(/\W/g, "").toLowerCase(),
      NOW,
      status,
    );
  payment("pay-sep", "st-sep", "APPROVED", "REF 1111 2222");
  payment("pay-oct", "st-oct", "PENDING", "REF 3333 4444");
  run(db, "insert into email_log (id, type, to_email, user_id, statement_id, subject, dedupe_key) values ('mail1', 'SOA_GENERATED', 'ana@example.com', 'ana', 'st-sep', 'Statement', 'k1')");
}

const TABLES = ["user", "subscription", "membership", "statement", "payment_method", "payment", "email_log"] as const;

describe("migration 0002 (ambag bills)", () => {
  it("upgrades a database that already has statements, payments and emails without losing or changing any of it", () => {
    const db = openDb(":memory:");
    migrateDb(db, foldersUpTo(2));
    seedOldDatabase(db);

    const before = Object.fromEntries(TABLES.map((table) => [table, all(db, `select * from "${table}" order by id`)]));
    migrateDb(db); // the real, latest migrations

    for (const table of TABLES) {
      const after = all(db, `select * from "${table}" order by id`);
      expect(after, table).toHaveLength(before[table].length);
      // Every column that existed before still holds exactly what it held.
      after.forEach((row, i) => {
        for (const [column, value] of Object.entries(before[table][i])) expect(row[column], `${table}.${column}`).toEqual(value);
      });
    }

    // The new columns start out as "not a bill", "version 0", "not a guest", "a recurring plan".
    expect(all(db, "select bill_id, link_version from statement").every((r) => r.bill_id === null && r.link_version === 0)).toBe(true);
    expect(all(db, "select kind from subscription")).toEqual([{ kind: "RECURRING" }]);
    expect(all(db, "select is_guest from user").every((r) => r.is_guest === 0)).toBe(true);
    expect(all(db, "pragma foreign_key_check")).toEqual([]);
    expect(all(db, "pragma integrity_check")).toEqual([{ integrity_check: "ok" }]);
  });

  it("still allows one monthly statement per member, plan and month, but any number of ambag statements", () => {
    const db = openDb(":memory:");
    migrateDb(db);
    run(db, "insert into user (id, email) values ('admin', 'a@x.com'), ('ana', 'n@x.com')");
    run(db, "insert into subscription (id, name, ref_prefix, fee_minor) values ('spot', 'Spotify', 'SPOT', 100)");
    const monthly = (id: string, reference: string) =>
      run(
        db,
        `insert into statement (id, reference, user_id, subscription_id, period, subscription_name, amount_minor, outstanding_minor, currency, issued_at, due_at)
         values (?, ?, 'ana', 'spot', '2026-10', 'Spotify', 100, 100, 'PHP', ?, ?)`,
        id,
        reference,
        NOW,
        NOW,
      );
    monthly("s1", "SPOT-1");
    expect(() => monthly("s2", "SPOT-2")).toThrow(/UNIQUE/);

    const bill = (id: string) =>
      run(
        db,
        "insert into bill (id, title, total_minor, split_method, split_input, split_result, due_at, created_by) values (?, 'Dinner', 100, 'EQUAL', '{}', '{}', ?, 'admin')",
        id,
        NOW,
      );
    bill("b1");
    bill("b2");
    const share = (id: string, reference: string, billId: string) =>
      run(
        db,
        `insert into statement (id, reference, user_id, subscription_id, period, subscription_name, amount_minor, outstanding_minor, currency, issued_at, due_at, bill_id)
         values (?, ?, 'ana', 'spot', '2026-10', 'Dinner', 50, 50, 'PHP', ?, ?, ?)`,
        id,
        reference,
        NOW,
        NOW,
        billId,
      );
    share("s3", "AMBAG-1", "b1");
    share("s4", "AMBAG-2", "b2"); // same person, plan and month, a different bill: fine
    expect(() => share("s5", "AMBAG-3", "b1")).toThrow(/UNIQUE/); // the same person twice on one bill is not
  });

  it("is additive only: no later migration rebuilds a table (that is unsafe with live payments and foreign keys)", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(REAL, JOURNAL), "utf8")) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries.slice(2)) {
      const sql = fs.readFileSync(path.join(REAL, `${tag}.sql`), "utf8");
      expect(sql, tag).not.toMatch(/__new_|PRAGMA|DROP TABLE/i);
    }
  });
});
