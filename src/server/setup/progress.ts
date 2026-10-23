import { and, count, eq, ne } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { bills, paymentMethods, statements, users } from "@/server/db/schema";

export interface SetupStep {
  id: "methods" | "friends" | "first-bill";
  title: string;
  hint: string;
  href: string;
  cta: string;
  done: boolean;
}

export interface SetupCounts {
  activeMethods: number;
  friends: number;
  bills: number;
  statements: number;
}

/** The three things a new admin needs before the app is useful, in the order that makes sense. */
export function buildSetupSteps(counts: SetupCounts): SetupStep[] {
  return [
    {
      id: "methods",
      title: "Add how friends pay you",
      hint: "Add GCash, Maya, a bank account, or whatever you use, with your QR, so friends know where to send the money.",
      href: "/admin/settings",
      cta: "Add a payment method",
      done: counts.activeMethods > 0,
    },
    {
      id: "friends",
      title: "Add your friends",
      hint: "Invite them by email, or add someone who just needs a link.",
      href: "/admin/members",
      cta: "Add friends",
      done: counts.friends > 0,
    },
    {
      id: "first-bill",
      title: "Make your first bill",
      hint: "Split a dinner or a bill with a new ambag, or set up a monthly plan.",
      href: "/admin/ambag/new",
      cta: "New ambag",
      done: counts.bills > 0 || counts.statements > 0,
    },
  ];
}

export interface SetupProgress {
  steps: SetupStep[];
  doneCount: number;
  complete: boolean;
}

/** Reads the real state of the app to see how far along setup is. */
export function getSetupProgress(db: Db): SetupProgress {
  const one = (rows: { n: number }[]) => rows[0]?.n ?? 0;
  const counts: SetupCounts = {
    activeMethods: one(db.select({ n: count() }).from(paymentMethods).where(eq(paymentMethods.isActive, true)).all()),
    friends: one(db.select({ n: count() }).from(users).where(and(ne(users.role, "ADMIN"), eq(users.isActive, true))).all()),
    bills: one(db.select({ n: count() }).from(bills).all()),
    statements: one(db.select({ n: count() }).from(statements).all()),
  };
  const steps = buildSetupSteps(counts);
  const doneCount = steps.filter((step) => step.done).length;
  return { steps, doneCount, complete: doneCount === steps.length };
}
