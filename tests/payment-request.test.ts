import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createBill } from "@/server/bills";
import { sendPaymentRequest } from "@/server/bills/request";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { addGuest, setGuestEmail } from "@/server/members/guests";
import { createTestDb } from "./helpers/db";

let db: Db;
let admin: typeof s.users.$inferSelect;
let ana: typeof s.users.$inferSelect;
let tito: typeof s.users.$inferSelect;
let titoShare: typeof s.statements.$inferSelect;
let anaShare: typeof s.statements.$inferSelect;

const NOW = new Date("2026-10-05T04:00:00Z");

beforeEach(() => {
  db = createTestDb();
  admin = db.insert(s.users).values({ email: "admin@example.com", name: "Admin", role: "ADMIN" }).returning().get();
  ana = db.insert(s.users).values({ email: "ana@example.com", name: "Ana" }).returning().get();
  const guest = addGuest(db, { name: "Tito Boy", actorId: admin.id });
  if (!guest.ok) throw new Error(guest.error);
  tito = guest.user;
  const bill = createBill(db, {
    billId: crypto.randomUUID(),
    title: "Karaoke night",
    dueDate: "2026-10-20",
    split: { v: 1, method: "EQUAL", totalMinor: 60000, participants: [admin.id, ana.id, tito.id] },
    actorId: admin.id,
    now: NOW,
  });
  if (!bill.ok) throw new Error("bill");
  titoShare = bill.statements.find((st) => st.userId === tito.id)!;
  anaShare = bill.statements.find((st) => st.userId === ana.id)!;
});

const mails = () => db.select().from(s.emailLogs).all();

describe("sendPaymentRequest", () => {
  it("emails a member their share on demand, as the 'your ambag is ready' message", () => {
    const before = mails().length;
    const result = sendPaymentRequest(db, { statementId: anaShare.id, actorId: admin.id, now: NOW });
    expect(result).toEqual({ ok: true, email: "ana@example.com" });
    const sent = mails().slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "SOA_GENERATED", toEmail: "ana@example.com", statementId: anaShare.id });
    expect(db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "bill.request_sent")).all()).toHaveLength(1);
  });

  it("emails a guest once they have an address, with their private link (the flag, never the link itself)", () => {
    expect(sendPaymentRequest(db, { statementId: titoShare.id, actorId: admin.id, now: NOW })).toEqual({ ok: false, error: "NO_EMAIL" });
    setGuestEmail(db, { userId: tito.id, email: "tito@example.com", actorId: admin.id });
    const before = mails().length;
    expect(sendPaymentRequest(db, { statementId: titoShare.id, actorId: admin.id, now: NOW })).toEqual({ ok: true, email: "tito@example.com" });
    const mail = mails().slice(before)[0];
    expect(mail.toEmail).toBe("tito@example.com");
    expect(JSON.parse(mail.payload)).toMatchObject({ shareLink: "1" });
    expect(mail.payload).not.toContain("/s/");
  });

  it("does not send the same request twice if it is pressed twice in a moment, but can be sent again later", () => {
    sendPaymentRequest(db, { statementId: anaShare.id, actorId: admin.id, now: NOW });
    const afterFirst = mails().length;
    sendPaymentRequest(db, { statementId: anaShare.id, actorId: admin.id, now: new Date(NOW.getTime() + 5_000) });
    expect(mails()).toHaveLength(afterFirst);
    sendPaymentRequest(db, { statementId: anaShare.id, actorId: admin.id, now: new Date(NOW.getTime() + 10 * 60_000) });
    expect(mails()).toHaveLength(afterFirst + 1);
  });

  it("only works for an ambag share that is still owed, and only for an admin", () => {
    expect(sendPaymentRequest(db, { statementId: anaShare.id, actorId: ana.id, now: NOW })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(sendPaymentRequest(db, { statementId: crypto.randomUUID(), actorId: admin.id, now: NOW })).toEqual({ ok: false, error: "NOT_FOUND" });
    db.update(s.statements).set({ status: "PAID", outstandingMinor: 0 }).where(eq(s.statements.id, anaShare.id)).run();
    expect(sendPaymentRequest(db, { statementId: anaShare.id, actorId: admin.id, now: NOW })).toEqual({ ok: false, error: "NOT_OWED" });
  });
});
