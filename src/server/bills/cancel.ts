import { eq } from "drizzle-orm";
import type { StatementStatus } from "@/lib/enums";
import { cleanFreeText } from "@/lib/names";
import { recordAudit } from "@/server/audit";
import { CANCELLABLE, MAX_REASON_LENGTH, MIN_REASON_LENGTH, cancelStatementIn } from "@/server/billing/statements";
import type { Db } from "@/server/db/client";
import { bills, statements } from "@/server/db/schema";
import { isActiveAdmin } from "./create";

const asDb = (tx: unknown) => tx as Db;

export interface BlockedStatement {
  statementId: string;
  userId: string;
  status: StatementStatus;
}

export type CancelBillResult =
  | { ok: true; cancelled: number }
  | { ok: false; error: "FORBIDDEN" | "NOT_FOUND" | "REASON_REQUIRED" | "REASON_TOO_LONG" | "ALREADY_CANCELLED" }
  | { ok: false; error: "BLOCKED"; blockedBy: BlockedStatement[] };

/**
 * Cancels a bill and every statement still waiting for money. All or nothing: if anyone has paid or reported
 * paying, nothing changes and the result says who, because that money has to be dealt with first. Bills are not
 * edited: to fix one, cancel it and make a new one.
 */
export function cancelBill(
  db: Db,
  input: { billId: string; actorId: string; reason: string; now?: Date },
): CancelBillResult {
  const reason = cleanFreeText(input.reason);
  const now = input.now ?? new Date();

  if (!isActiveAdmin(db, input.actorId)) return { ok: false, error: "FORBIDDEN" };
  if (reason.length < MIN_REASON_LENGTH) return { ok: false, error: "REASON_REQUIRED" };
  if (reason.length > MAX_REASON_LENGTH) return { ok: false, error: "REASON_TOO_LONG" };

  return db.transaction((tx): CancelBillResult => {
    const t = asDb(tx);
    const bill = t.select().from(bills).where(eq(bills.id, input.billId)).get();
    if (!bill) return { ok: false, error: "NOT_FOUND" };
    if (bill.cancelledAt) return { ok: false, error: "ALREADY_CANCELLED" };

    const rows = t.select().from(statements).where(eq(statements.billId, bill.id)).all();
    const blockedBy = rows
      .filter((row) => row.status !== "CANCELLED" && !CANCELLABLE.includes(row.status))
      .map((row) => ({ statementId: row.id, userId: row.userId, status: row.status }));
    if (blockedBy.length > 0) return { ok: false, error: "BLOCKED", blockedBy };

    let cancelled = 0;
    for (const row of rows.filter((r) => CANCELLABLE.includes(r.status))) {
      const result = cancelStatementIn(t, { statementId: row.id, actorId: input.actorId, reason, now });
      // Cannot happen (checked above, under the same write lock); if it somehow does, roll everything back.
      if (!result.ok) throw new Error(`Could not cancel statement ${row.id}: ${result.error}`);
      cancelled++;
    }

    t.update(bills).set({ cancelledAt: now }).where(eq(bills.id, bill.id)).run();
    recordAudit(t, { actorId: input.actorId, action: "bill.cancelled", entityType: "bill", entityId: bill.id, metadata: { reason, cancelled } });
    return { ok: true, cancelled };
  }, { behavior: "immediate" });
}
