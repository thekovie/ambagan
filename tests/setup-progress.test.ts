import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { buildSetupSteps, getSetupProgress } from "@/server/setup/progress";
import { createTestDb } from "./helpers/db";

describe("buildSetupSteps", () => {
  it("lists the three things a new admin has to do, none done to begin with", () => {
    const steps = buildSetupSteps({ activeMethods: 0, friends: 0, bills: 0, statements: 0 });
    expect(steps.map((st) => [st.id, st.done])).toEqual([
      ["methods", false],
      ["friends", false],
      ["first-bill", false],
    ]);
    expect(steps.map((st) => st.href)).toEqual(["/admin/settings", "/admin/members", "/admin/ambag/new"]);
  });

  it("ticks each step off when its thing exists", () => {
    expect(buildSetupSteps({ activeMethods: 1, friends: 0, bills: 0, statements: 0 }).map((st) => st.done)).toEqual([true, false, false]);
    expect(buildSetupSteps({ activeMethods: 1, friends: 2, bills: 0, statements: 0 }).map((st) => st.done)).toEqual([true, true, false]);
  });

  it("counts either an ambag or a monthly statement as the first bill", () => {
    expect(buildSetupSteps({ activeMethods: 0, friends: 0, bills: 1, statements: 0 })[2].done).toBe(true);
    expect(buildSetupSteps({ activeMethods: 0, friends: 0, bills: 0, statements: 4 })[2].done).toBe(true);
  });
});

describe("getSetupProgress", () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
  });

  it("reads the real state: switched-on methods and friends other than the admin (guests included)", () => {
    db.insert(s.users).values({ email: "admin@example.com", name: "Admin", role: "ADMIN" }).run();
    expect(getSetupProgress(db).steps.map((st) => st.done)).toEqual([false, false, false]);

    db.insert(s.paymentMethods).values({ kind: "GCASH", label: "GCash", isActive: false }).run();
    expect(getSetupProgress(db).steps[0].done).toBe(false);
    db.insert(s.paymentMethods).values({ kind: "MAYA", label: "Maya", isActive: true }).run();
    expect(getSetupProgress(db).steps[0].done).toBe(true);

    db.insert(s.users).values({ email: "guest-1@guests.invalid", name: "Tito", isGuest: true }).run();
    const progress = getSetupProgress(db);
    expect(progress.steps[1].done).toBe(true);
    expect(progress.doneCount).toBe(2);
    expect(progress.complete).toBe(false);
  });
});
