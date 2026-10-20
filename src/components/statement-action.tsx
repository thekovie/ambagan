import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { StatementStatus } from "@/lib/enums";
import { statusAction } from "@/lib/status";
import { effectiveStatus } from "@/lib/statement-view";
import { cn } from "@/lib/utils";

interface StatementActionProps {
  statement: { id: string; status: StatementStatus; dueAt: Date };
  /** Skip the "View statement" button when already on the statement page. */
  omitView?: boolean;
}

/**
 * The one contextual action for a statement, shown inside its sticker.
 * Unpaid gets the candy "pay now" button; every other state uses the sticker's own ink colours,
 * because the candy colour would blend into the rose corner tab on an overdue sticker.
 */
export function StatementAction({ statement, omitView }: StatementActionProps) {
  const shown = effectiveStatus(statement);
  const action = statusAction(shown);
  if (action.kind === "view" && omitView) return null;

  const target =
    action.kind === "submit" ? `/pay/${statement.id}` : action.kind === "view" ? `/statements/${statement.id}` : "/payments";

  return (
    <Link
      href={target}
      className={cn(buttonVariants({ variant: shown === "UNPAID" ? "candy" : "onSticker", size: "lg" }), "w-full sm:w-auto")}
    >
      {action.label} <ArrowRight data-icon="inline-end" />
    </Link>
  );
}
