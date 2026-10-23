"use client";

import { ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { joinPlanAction, leavePlanAction, type MemberActionState } from "./actions";

export interface PlanOption {
  id: string;
  name: string;
  isActive: boolean;
}

function PlanRow({ userId, display, plan, joined }: { userId: string; display: string; plan: PlanOption; joined: boolean }) {
  const [joinState, join, joining] = useActionState<MemberActionState, FormData>(joinPlanAction, {});
  const [leaveState, leave] = useActionState<MemberActionState, FormData>(leavePlanAction, {});
  const error = joinState.error ?? leaveState.error;

  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">
          {plan.name}
          {joined ? <span className="ml-2 rounded-full bg-st-mint px-2 py-0.5 text-xs font-bold text-st-ink">In this plan</span> : null}
          {plan.isActive ? null : <span className="ml-2 text-xs font-semibold text-muted-foreground">switched off</span>}
        </p>
        {joined ? (
          <form action={leave}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="subscriptionId" value={plan.id} />
            <ConfirmButton
              variant="ghost"
              size="sm"
              confirmLabel={
                <>
                  Sure? Remove<span className="sr-only"> {display} from {plan.name}</span>
                </>
              }
            >
              Remove<span className="sr-only"> {display} from {plan.name}</span>
            </ConfirmButton>
          </form>
        ) : (
          <form action={join}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="subscriptionId" value={plan.id} />
            <Button type="submit" variant="outline" size="sm" disabled={joining || !plan.isActive}>
              <Plus data-icon="inline-start" />
              {joining ? "Adding…" : "Add"}
              <span className="sr-only"> {display} to {plan.name}</span>
            </Button>
          </form>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/**
 * "Add to a plan" for someone who has none, "Change plans" for someone who does. Adding starts their billing from the
 * first month that isn't already late; removing stops new statements and leaves the ones already issued alone.
 */
export function PlanControls({ userId, display, joinedIds, plans }: { userId: string; display: string; joinedIds: string[]; plans: PlanOption[] }) {
  const none = joinedIds.length === 0;
  return (
    <details className="group">
      <summary
        className={cn(
          "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm font-bold marker:hidden",
          none ? "border-st-ink bg-st-butter text-st-ink" : "border-border text-muted-foreground",
        )}
      >
        {none ? "Add to a plan" : "Change plans"}
        <span className="sr-only"> for {display}</span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-3 flex max-w-md flex-col gap-3 rounded-xl bg-secondary p-4">
        {plans.length === 0 ? (
          <p className="text-sm">
            There are no plans yet.{" "}
            <Link href="/admin/subscriptions" className="font-semibold underline underline-offset-4">
              Create one in Plans
            </Link>
            , then come back to add {display}.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {plans.map((plan) => (
                <PlanRow key={plan.id} userId={userId} display={display} plan={plan} joined={joinedIds.includes(plan.id)} />
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Their first statement comes from the next daily run (or &ldquo;Generate missing&rdquo; on Statements). If the plan&apos;s due day has already passed this month, billing starts next month.
            </p>
          </>
        )}
      </div>
    </details>
  );
}
