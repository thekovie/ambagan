import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Sticker } from "@/components/sticker";
import { stickerProps } from "@/lib/statement-view";
import { requireUser } from "@/server/auth/session";
import { listStatementsForUser } from "@/server/billing/statements";
import { getDb } from "@/server/db/client";

export const metadata: Metadata = { title: "Statements" };

export default async function StatementsPage() {
  const user = await requireUser();
  const statements = listStatementsForUser(getDb(), user.id);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-display">Statements</h1>
        <p className="mt-3 text-muted-foreground">Every statement we&apos;ve issued you, newest first.</p>
      </header>

      {statements.length === 0 ? (
        <EmptyState
          icon={<ReceiptText />}
          title="No statements yet"
          description="Your first statement or ambag shows up here as soon as it's issued, and we'll email you when it lands."
        />
      ) : (
        <div className="sticker-sheet max-w-2xl">
          {statements.map((statement) => (
            <Link
              key={statement.id}
              href={`/statements/${statement.id}`}
              className="block rounded-lg outline-offset-4"
            >
              <Sticker compact {...stickerProps(statement)} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
