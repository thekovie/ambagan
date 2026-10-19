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
 * The one contextual action for a statement, shown inside its strip.
 * Unpaid gets the magenta "pay now" foil; every other state uses the strip's own inverse colours,
 * because magenta foil would vanish on an overdue (magenta) strip.
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
      className={cn(buttonVariants({ variant: shown === "UNPAID" ? "foil" : "inverse", size: "lg" }), "w-full sm:w-auto")}
    >
      {action.label} <ArrowRight data-icon="inline-end" />
    </Link>
  );
}
