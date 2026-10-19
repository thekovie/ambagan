"use client";

import { Save } from "lucide-react";
import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { saveSubscriptionAction, type SubscriptionFormState } from "./actions";

export interface SubscriptionView {
  id: string;
  name: string;
  refPrefix: string;
  feeMinor: number;
  issueDay: number;
  dueDay: number;
  paymentInstructions: string | null;
  isActive: boolean;
}

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="text-sm font-semibold text-destructive">
      {message}
    </p>
  ) : null;
}

export function SubscriptionForm({ subscription }: { subscription?: SubscriptionView }) {
  const [state, action, pending] = useActionState<SubscriptionFormState, FormData>(saveSubscriptionAction, {});
  // Ids are unique per form instance: the page renders one form per plan plus one for a new plan.
  const uid = useId();
  const isEdit = Boolean(subscription);
  const errors = state.errors ?? {};
  const typed = state.values;

  const id = (field: string) => `${uid}-${field}`;
  const bad = (field: string) => (errors[field] ? true : undefined);
  const describe = (field: string) => (errors[field] ? `${id(field)}-error` : undefined);
  // After a failed submit the typed values come back from the server; otherwise show the saved plan.
  const value = (field: string, saved?: string | number | null) => typed?.[field] ?? (saved == null ? "" : String(saved));

  return (
    // React clears uncontrolled fields after a successful action and restores `defaultValue`s,
    // so echoing `typed` on error keeps the admin's input and success returns to the saved values.
    <form action={action} className="flex flex-col gap-5">
      {subscription ? <input type="hidden" name="id" value={subscription.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("name")}>Name</Label>
          <Input
            id={id("name")}
            name="name"
            required
            defaultValue={value("name", subscription?.name)}
            placeholder="Spotify"
            aria-invalid={bad("name")}
            aria-describedby={describe("name")}
          />
          <FieldError id={`${id("name")}-error`} message={errors.name} />
        </div>

        {isEdit ? null : (
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("refPrefix")}>Reference prefix</Label>
            <Input
              id={id("refPrefix")}
              name="refPrefix"
              required
              maxLength={6}
              defaultValue={value("refPrefix")}
              placeholder="SPOT"
              className="uppercase"
              aria-invalid={bad("refPrefix")}
              aria-describedby={[describe("refPrefix"), id("refPrefix-hint")].filter(Boolean).join(" ")}
            />
            <p id={id("refPrefix-hint")} className="text-sm text-muted-foreground">
              Statements read like SPOT-202610-A1B2C3. It can&apos;t change later.
            </p>
            <FieldError id={`${id("refPrefix")}-error`} message={errors.refPrefix} />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor={id("fee")}>Monthly fee per member (₱)</Label>
          <Input
            id={id("fee")}
            name="feePesos"
            required
            inputMode="decimal"
            autoComplete="off"
            defaultValue={value("feePesos", subscription ? (subscription.feeMinor / 100).toFixed(2) : null)}
            placeholder="50.00"
            aria-invalid={bad("feePesos")}
            aria-describedby={describe("feePesos")}
          />
          <FieldError id={`${id("feePesos")}-error`} message={errors.feePesos} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("issue")}>Issue on the</Label>
            <NativeSelect
              id={id("issue")}
              name="issueDay"
              defaultValue={value("issueDay", subscription?.issueDay ?? 1)}
              aria-invalid={bad("issueDay")}
              aria-describedby={describe("issueDay")}
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {ordinal(d)}
                </option>
              ))}
            </NativeSelect>
            <FieldError id={`${id("issueDay")}-error`} message={errors.issueDay} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("due")}>Due on the</Label>
            <NativeSelect
              id={id("due")}
              name="dueDay"
              defaultValue={value("dueDay", subscription?.dueDay ?? 10)}
              aria-invalid={bad("dueDay")}
              aria-describedby={describe("dueDay")}
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {ordinal(d)}
                </option>
              ))}
            </NativeSelect>
            <FieldError id={`${id("dueDay")}-error`} message={errors.dueDay} />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor={id("instructions")}>Payment instructions (optional)</Label>
          <Textarea
            id={id("instructions")}
            name="paymentInstructions"
            defaultValue={value("paymentInstructions", subscription?.paymentInstructions)}
            placeholder="Shown on every statement, e.g. add your name in the notes."
            aria-invalid={bad("paymentInstructions")}
            aria-describedby={describe("paymentInstructions")}
          />
          <FieldError id={`${id("paymentInstructions")}-error`} message={errors.paymentInstructions} />
        </div>

        <label className="flex items-center gap-3 text-sm font-semibold sm:col-span-2">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={typed ? typed.isActive === "on" : (subscription?.isActive ?? true)}
            className="size-5 rounded accent-foil-magenta"
          />
          Active: generate statements for this plan
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}

      {/* Always mounted so screen readers announce the text when it appears. */}
      <p role="status" aria-live="polite" className="text-sm font-semibold empty:hidden">
        {state.saved
          ? isEdit
            ? "Saved. A new fee applies to statements issued from now on; existing statements keep their amount."
            : "Plan created."
          : null}
      </p>

      <div>
        <Button type="submit" disabled={pending}>
          <Save data-icon="inline-start" />
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create plan"}
        </Button>
      </div>
    </form>
  );
}
