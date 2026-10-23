import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { listParticipants } from "@/server/bills";
import { manilaDateKey } from "@/server/billing/period";
import { getDb } from "@/server/db/client";
import { BillBuilder } from "./bill-builder";

export const metadata: Metadata = { title: "New ambag" };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** A week from today, as a Manila calendar date ("YYYY-MM-DD"). */
const inAWeek = () => manilaDateKey(new Date(Date.now() + WEEK_MS));

export default async function NewAmbagPage() {
  const admin = await requireAdmin();
  const people = listParticipants(getDb());
  // Made here, not in the browser, so the form is stable for this page load and a double submit is the same bill.
  const billId = crypto.randomUUID();
  const defaultDueDate = inAWeek();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/admin/ambag" className="inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground underline underline-offset-4">
          All ambag
        </Link>
        <h1 className="font-display text-display mt-2">New ambag</h1>
        <p className="mt-2 text-muted-foreground">You paid, the group chips in. Three quick steps.</p>
      </header>
      <BillBuilder currentUserId={admin.id} billId={billId} defaultDueDate={defaultDueDate} people={people} />
    </div>
  );
}
