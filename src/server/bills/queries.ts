import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { isPlaceholderEmail } from "@/lib/guest";
import type { SplitLine, SplitMethod } from "@/lib/split";
import type { StatementStatus } from "@/lib/enums";
import { effectiveStatus } from "@/lib/statement-view";
import type { Db } from "@/server/db/client";
import { bills, statements, users } from "@/server/db/schema";

type Bill = typeof bills.$inferSelect;
type StatementRow = typeof statements.$inferSelect;

const OPEN: StatementStatus[] = ["UNPAID", "OVERDUE", "UNDER_VERIFICATION"];

export interface BillListRow {
  bill: Bill;
  statementCount: number;
  paidCount: number;
  /** Statements still waiting for money or for the admin's check. */
  openCount: number;
  outstandingMinor: number;
}

/** Newest first, with how much of each bill is still to collect. */
export function listBills(db: Db): BillListRow[] {
  const all = db.select().from(bills).orderBy(desc(bills.createdAt), desc(bills.id)).all();
  const owed = db.select().from(statements).where(isNotNull(statements.billId)).all();
  return all.map((bill) => {
    const own = owed.filter((st) => st.billId === bill.id);
    return {
      bill,
      statementCount: own.length,
      paidCount: own.filter((st) => st.status === "PAID").length,
      openCount: own.filter((st) => OPEN.includes(st.status)).length,
      outstandingMinor: own.reduce((sum, st) => sum + st.outstandingMinor, 0),
    };
  });
}

export interface Participant {
  id: string;
  name: string;
  /** Null for a guest with only a placeholder address (nobody to email). */
  email: string | null;
  isGuest: boolean;
  isAdmin: boolean;
}

/** Everyone who can be put in a bill: active members first, then guests, each group in the order they were added. */
export function listParticipants(db: Db): Participant[] {
  return db
    .select()
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.isGuest), asc(users.createdAt), sql`${users}.rowid`)
    .all()
    .map((u) => ({
      id: u.id,
      name: u.name?.trim() || u.email,
      email: isPlaceholderEmail(u.email) ? null : u.email,
      isGuest: u.isGuest,
      isAdmin: u.role === "ADMIN",
    }));
}

export interface BillDetailRow extends StatementRow {
  memberName: string;
  memberEmail: string;
  isGuest: boolean;
  /** What the person sees: an unpaid statement past its due day reads as overdue. */
  status: StatementStatus;
}

export interface BillDetail {
  bill: Bill;
  rows: BillDetailRow[];
  /** The admin's own share of a bill they fronted: counted in the split but never billed. */
  adminShareMinor: number;
}

export function getBillDetail(db: Db, billId: string, now = new Date()): BillDetail | null {
  const bill = db.select().from(bills).where(eq(bills.id, billId)).get();
  if (!bill) return null;

  const rows = db
    .select({ statement: statements, name: users.name, email: users.email, isGuest: users.isGuest })
    .from(statements)
    .innerJoin(users, eq(users.id, statements.userId))
    .where(eq(statements.billId, billId))
    .all()
    .map(({ statement, name, email, isGuest }) => ({
      ...statement,
      memberName: name?.trim() || email,
      memberEmail: email,
      isGuest,
      status: effectiveStatus(statement, now),
    }))
    .sort((a, b) => a.memberName.localeCompare(b.memberName));

  const adminShare = bill.splitResult.shares.find((share) => share.userId === bill.createdBy);
  return { bill, rows, adminShareMinor: adminShare?.amountMinor ?? 0 };
}

export interface ShareView {
  billId: string;
  title: string;
  note: string | null;
  totalMinor: number;
  method: SplitMethod;
  participantCount: number;
  /** This person's amount and how it was worked out: only their own lines, never anyone else's. */
  amountMinor: number;
  lines: SplitLine[];
}

/**
 * What a friend may see of how their ambag was split. Ownership is part of the query (someone else's statement,
 * a missing one and a monthly one all read as nothing), and only this person's slice leaves this function.
 */
export function getShareForStatement(db: Db, userId: string, statementId: string): ShareView | null {
  const row = db
    .select({ statement: statements, bill: bills })
    .from(statements)
    .innerJoin(bills, eq(bills.id, statements.billId))
    .where(and(eq(statements.id, statementId), eq(statements.userId, userId)))
    .get();
  if (!row) return null;
  return shareOf(row.bill, row.statement.userId);
}

/** The slice for one person, from the split stored with the bill (so it never drifts if the rounding rules change). */
export function shareOf(bill: Bill, userId: string): ShareView | null {
  const share = bill.splitResult.shares.find((s) => s.userId === userId);
  if (!share) return null;
  return {
    billId: bill.id,
    title: bill.title,
    note: bill.note,
    totalMinor: bill.totalMinor,
    method: bill.splitMethod,
    participantCount: bill.splitResult.shares.length,
    amountMinor: share.amountMinor,
    lines: share.lines,
  };
}
