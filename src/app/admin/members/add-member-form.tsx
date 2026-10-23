"use client";

import { MailCheck, TriangleAlert, UserPlus } from "lucide-react";
import { useActionState } from "react";
import { CopyField } from "@/components/copy-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useFocusFirstError } from "@/lib/use-focus-first-error";
import { addMemberAction, type MemberActionState } from "./actions";

interface Plan {
  id: string;
  name: string;
}

export function AddMemberForm({ plans }: { plans: Plan[] }) {
  const [state, action, pending] = useActionState<MemberActionState, FormData>(addMemberAction, {});
  const { values } = state;
  const formRef = useFocusFirstError(state);
  // The message sits under the field it is about; one that is about the form as a whole sits above the button.
  const fieldError = (field: "name" | "email" | "plan") => (state.errorField === field ? state.error : undefined);
  const flag = (field: "name" | "email" | "plan") => (state.errorField === field ? { "aria-invalid": true as const, "aria-describedby": "member-error" } : {});
  const fieldMessage = (field: "name" | "email" | "plan") =>
    fieldError(field) ? (
      <p id="member-error" role="alert" className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        {state.error}
      </p>
    ) : null;

  return (
    // React clears uncontrolled fields after a successful action. After an error the submitted
    // values are echoed back through `defaultValue`, so nothing the admin typed is lost.
    <form ref={formRef} action={action} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="member-name">Name</Label>
          <Input id="member-name" name="name" autoComplete="off" required maxLength={80} placeholder="Full name" defaultValue={values?.name} {...flag("name")} />
          {fieldMessage("name")}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="member-email">Email</Label>
          <Input
            id="member-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            placeholder="name@example.com"
            defaultValue={values?.email}
            {...flag("email")}
          />
          {fieldMessage("email")}
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="member-plan">Plan</Label>
          <NativeSelect id="member-plan" name="subscriptionId" defaultValue={values?.subscriptionId ?? plans[0]?.id ?? ""} {...flag("plan")}>
            <option value="">No plan yet</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </NativeSelect>
          {fieldMessage("plan")}
        </div>
      </div>

      {state.error && !state.errorField ? (
        <p id="member-error" role="alert" className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      {/* Always mounted so screen readers announce the text when it appears. */}
      <div role="status" aria-live="polite">
        {state.invite ? (
          <div className="flex flex-col gap-3 rounded-xl bg-secondary p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              {state.invite.emailSent ? (
                <>
                  <MailCheck className="size-4 shrink-0" aria-hidden="true" />
                  Invitation emailed to {state.invite.email}.
                </>
              ) : (
                <>
                  <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                  Couldn&apos;t send the email. Share this link with them instead:
                </>
              )}
            </p>
            <CopyField value={state.invite.url} label="Invitation link" />
          </div>
        ) : null}
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          <UserPlus data-icon="inline-start" />
          {pending ? "Adding…" : "Add and send invite"}
        </Button>
      </div>
    </form>
  );
}
