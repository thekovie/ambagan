import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { parseSubscriptionForm, parseSubscriptionUpdateForm } from "@/server/subscriptions/form";
import {
  createSubscription,
  listSubscriptions,
  seedDefaultSubscription,
  updateSubscription,
} from "@/server/subscriptions/service";
import { createTestDb } from "./helpers/db";

let db: Db;
let admin: typeof s.users.$inferSelect;

const valid = {
  name: "Netflix",
  refPrefix: "nflx",
  feePesos: "199",
  issueDay: "1",
  dueDay: "10",
  paymentInstructions: "",
  isActive: "on",
};

const NO_PENALTY = { penaltyMinor: 0, penaltyEveryDays: 1, penaltyCapMinor: null };

beforeEach(() => {
  db = createTestDb();
  admin = db.insert(s.users).values({ email: "boss@example.com", role: "ADMIN" }).returning().get();
});

describe("seedDefaultSubscription", () => {
  it("creates Spotify with the brief's defaults, once", () => {
    seedDefaultSubscription(db);
    seedDefaultSubscription(db);
    const all = db.select().from(s.subscriptions).all();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      name: "Spotify",
      refPrefix: "SPOT",
      feeMinor: 5000,
      currency: "PHP",
      issueDay: 1,
      dueDay: 10,
      isActive: true,
    });
  });

  it("does nothing when any subscription already exists (admin edits are never overwritten)", () => {
    db.insert(s.subscriptions).values({ name: "Custom", refPrefix: "CUST", feeMinor: 1 }).run();
    seedDefaultSubscription(db);
    expect(db.select().from(s.subscriptions).all()).toHaveLength(1);
  });
});

describe("parseSubscriptionForm", () => {
  it("converts pesos to centavos, uppercases the prefix and reads the checkbox", () => {
    const res = parseSubscriptionForm(valid);
    expect(res).toEqual({
      ok: true,
      value: {
        name: "Netflix",
        refPrefix: "NFLX",
        feeMinor: 19900,
        issueDay: 1,
        dueDay: 10,
        paymentInstructions: null,
        isActive: true,
        ...NO_PENALTY,
      },
    });
  });

  it("reads a late penalty: pesos, how often, and an optional limit", () => {
    const res = parseSubscriptionForm({ ...valid, penaltyPesos: "10", penaltyEveryDays: "2", penaltyCapPesos: "50" });
    expect(res.ok && res.value).toMatchObject({ penaltyMinor: 1000, penaltyEveryDays: 2, penaltyCapMinor: 5000 });
  });

  it("blank penalty fields mean no penalty and no limit, and a limit without a penalty is dropped", () => {
    expect(parseSubscriptionForm({ ...valid, penaltyPesos: "", penaltyCapPesos: "" }).ok && "ok").toBe("ok");
    const res = parseSubscriptionForm({ ...valid, penaltyPesos: "", penaltyEveryDays: "3", penaltyCapPesos: "80" });
    expect(res.ok && res.value).toMatchObject({ penaltyMinor: 0, penaltyEveryDays: 3, penaltyCapMinor: null });
  });

  it.each([
    [{ penaltyPesos: "abc" }, "penaltyPesos"],
    [{ penaltyPesos: "-5" }, "penaltyPesos"],
    [{ penaltyPesos: "10", penaltyEveryDays: "0" }, "penaltyEveryDays"],
    [{ penaltyPesos: "10", penaltyEveryDays: "45" }, "penaltyEveryDays"],
    [{ penaltyPesos: "10", penaltyCapPesos: "abc" }, "penaltyCapPesos"],
    [{ penaltyPesos: "10", penaltyCapPesos: "5" }, "penaltyCapPesos"],
  ])("rejects a bad penalty %j on %s", (over, field) => {
    const res = parseSubscriptionForm({ ...valid, ...over });
    expect(!res.ok && Object.keys(res.errors)).toContain(field);
  });

  it("treats a missing checkbox as inactive", () => {
    const res = parseSubscriptionForm({ ...valid, isActive: undefined });
    expect(res.ok && res.value.isActive).toBe(false);
  });

  it.each([
    [{ feePesos: "0" }, "feePesos"],
    [{ feePesos: "abc" }, "feePesos"],
    [{ feePesos: "10.555" }, "feePesos"],
    [{ feePesos: "1000000.01" }, "feePesos"],
    [{ name: "  " }, "name"],
    [{ refPrefix: "N" }, "refPrefix"],
    [{ refPrefix: "NF-1" }, "refPrefix"],
    [{ issueDay: "0" }, "issueDay"],
    [{ issueDay: "29" }, "issueDay"],
    [{ dueDay: "5", issueDay: "10" }, "dueDay"],
  ])("rejects %j", (override, field) => {
    const res = parseSubscriptionForm({ ...valid, ...override });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors)).toContain(field);
  });
});

describe("parseSubscriptionUpdateForm", () => {
  it("ignores any submitted refPrefix: the prefix is fixed after creation", () => {
    const res = parseSubscriptionUpdateForm({ ...valid, refPrefix: "HACK" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).not.toHaveProperty("refPrefix");
  });

  it("applies the same validation as creation", () => {
    const res = parseSubscriptionUpdateForm({ ...valid, feePesos: "-1" });
    expect(res.ok).toBe(false);
  });
});

describe("createSubscription", () => {
  it("stores the subscription and audits it", () => {
    const parsed = parseSubscriptionForm(valid);
    if (!parsed.ok) throw new Error("setup");
    const res = createSubscription(db, parsed.value, admin.id);
    expect(res.ok).toBe(true);
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "subscription.created")).all()).toHaveLength(1);
  });

  it("rejects a reference prefix that is already used", () => {
    const parsed = parseSubscriptionForm(valid);
    if (!parsed.ok) throw new Error("setup");
    createSubscription(db, parsed.value, admin.id);
    expect(createSubscription(db, { ...parsed.value, name: "Other" }, admin.id)).toEqual({ ok: false, error: "PREFIX_TAKEN" });
  });
});

describe("updateSubscription", () => {
  it("starts a penalty's clock when it is switched on, and keeps it through later edits", () => {
    seedDefaultSubscription(db);
    const sub = db.select().from(s.subscriptions).get()!;
    const same = { name: sub.name, feeMinor: sub.feeMinor, issueDay: sub.issueDay, dueDay: sub.dueDay, paymentInstructions: null, isActive: true };
    expect(sub.penaltySince).toBeNull();

    updateSubscription(db, sub.id, { ...same, penaltyMinor: 1000, penaltyEveryDays: 2, penaltyCapMinor: 5000 }, admin.id);
    const on = db.select().from(s.subscriptions).get()!;
    expect(on).toMatchObject({ penaltyMinor: 1000, penaltyEveryDays: 2, penaltyCapMinor: 5000 });
    expect(on.penaltySince).toBeInstanceOf(Date);

    // Changing the amount later is not "switching it on" again: statements already counted keep their start date.
    updateSubscription(db, sub.id, { ...same, penaltyMinor: 2000, penaltyEveryDays: 2, penaltyCapMinor: 5000 }, admin.id);
    expect(db.select().from(s.subscriptions).get()!.penaltySince).toEqual(on.penaltySince);
  });

  function setup() {
    seedDefaultSubscription(db);
    const sub = db.select().from(s.subscriptions).get()!;
    const member = db.insert(s.users).values({ email: "ana@example.com" }).returning().get();
    db.insert(s.statements)
      .values({
        reference: "SPOT-202610-AAAAAA",
        userId: member.id,
        subscriptionId: sub.id,
        period: "2026-10",
        subscriptionName: sub.name,
        amountMinor: sub.feeMinor,
        outstandingMinor: sub.feeMinor,
        currency: sub.currency,
        issuedAt: new Date("2026-10-01T00:00:00+08:00"),
        dueAt: new Date("2026-10-10T23:59:59+08:00"),
      })
      .run();
    return sub;
  }

  it("changes the fee for future statements without touching issued ones", () => {
    const sub = setup();
    const res = updateSubscription(
      db,
      sub.id,
      { name: "Spotify Family", feeMinor: 7500, issueDay: 1, dueDay: 12, paymentInstructions: "Pay by the 12th", isActive: true, ...NO_PENALTY },
      admin.id,
    );
    expect(res).toEqual({ ok: true });
    expect(db.select().from(s.subscriptions).get()).toMatchObject({ feeMinor: 7500, name: "Spotify Family", dueDay: 12 });
    expect(db.select().from(s.statements).get()).toMatchObject({ amountMinor: 5000, subscriptionName: "Spotify" });
  });

  it("audits what changed (before and after)", () => {
    const sub = setup();
    updateSubscription(db, sub.id, { name: "Spotify", feeMinor: 6000, issueDay: 1, dueDay: 10, paymentInstructions: null, isActive: true, ...NO_PENALTY }, admin.id);
    const log = db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "subscription.updated")).get()!;
    expect(JSON.parse(log.metadata)).toMatchObject({ changes: { feeMinor: { from: 5000, to: 6000 } } });
  });

  it("ignores a refPrefix smuggled into the update (references stay consistent)", () => {
    const sub = setup();
    const sneaky = { name: "Spotify", feeMinor: 5000, issueDay: 1, dueDay: 10, paymentInstructions: null, isActive: true, refPrefix: "HACK", ...NO_PENALTY };
    updateSubscription(db, sub.id, sneaky, admin.id);
    expect(db.select().from(s.subscriptions).get()?.refPrefix).toBe("SPOT");
  });

  it("reports unknown subscriptions", () => {
    expect(
      updateSubscription(db, "nope", { name: "x", feeMinor: 1, issueDay: 1, dueDay: 2, paymentInstructions: null, isActive: true, ...NO_PENALTY }, admin.id),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

describe("listSubscriptions", () => {
  it("counts active members per subscription", () => {
    seedDefaultSubscription(db);
    const sub = db.select().from(s.subscriptions).get()!;
    const a = db.insert(s.users).values({ email: "a@example.com" }).returning().get();
    const b = db.insert(s.users).values({ email: "b@example.com" }).returning().get();
    db.insert(s.memberships).values({ userId: a.id, subscriptionId: sub.id, startPeriod: "2026-10" }).run();
    db.insert(s.memberships).values({ userId: b.id, subscriptionId: sub.id, startPeriod: "2026-10", isActive: false }).run();
    expect(listSubscriptions(db)[0]).toMatchObject({ name: "Spotify", activeMembers: 1 });
  });
});
