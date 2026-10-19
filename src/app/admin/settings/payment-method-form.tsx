"use client";

import { Save } from "lucide-react";
import Image from "next/image";
import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { savePaymentMethodAction, type MethodFormState } from "./actions";

export interface PaymentMethodView {
  id: string;
  label: string;
  accountName: string | null;
  accountNumber: string | null;
  instructions: string | null;
  isActive: boolean;
  hasQr: boolean;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="text-sm font-semibold text-destructive">
      {message}
    </p>
  ) : null;
}

export function PaymentMethodForm({ method }: { method: PaymentMethodView }) {
  const [state, action, pending] = useActionState<MethodFormState, FormData>(savePaymentMethodAction, {});
  const uid = useId();
  const typed = state.values;
  const errors = state.errors ?? {};
  const id = (field: string) => `${uid}-${field}`;
  const describe = (field: string) => (errors[field] ? `${id(field)}-error` : undefined);
  const value = (field: string, saved: string | null) => typed?.[field] ?? saved ?? "";

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={method.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("label")}>Name shown to members</Label>
          <Input id={id("label")} name="label" required defaultValue={value("label", method.label)} aria-invalid={errors.label ? true : undefined} aria-describedby={describe("label")} />
          <FieldError id={`${id("label")}-error`} message={errors.label} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("holder")}>Account holder</Label>
          <Input id={id("holder")} name="accountName" autoComplete="off" defaultValue={value("accountName", method.accountName)} placeholder="Name on the account" aria-invalid={errors.accountName ? true : undefined} aria-describedby={describe("accountName")} />
          <FieldError id={`${id("accountName")}-error`} message={errors.accountName} />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor={id("number")}>Account number or identifier</Label>
          <Input id={id("number")} name="accountNumber" autoComplete="off" defaultValue={value("accountNumber", method.accountNumber)} placeholder="e.g. mobile number" aria-invalid={errors.accountNumber ? true : undefined} aria-describedby={describe("accountNumber")} />
          <FieldError id={`${id("accountNumber")}-error`} message={errors.accountNumber} />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor={id("instructions")}>Instructions (optional)</Label>
          <Textarea id={id("instructions")} name="instructions" defaultValue={value("instructions", method.instructions)} placeholder="e.g. Send to the QR, then put your name in the notes." aria-invalid={errors.instructions ? true : undefined} aria-describedby={describe("instructions")} />
          <FieldError id={`${id("instructions")}-error`} message={errors.instructions} />
        </div>

        <div className="flex flex-col gap-3 sm:col-span-2">
          <Label htmlFor={id("qr")}>QR code image</Label>
          {method.hasQr ? (
            <div className="flex items-start gap-4">
              {/* Served by an authorised route, not a static asset, so Next's image optimizer is skipped. */}
              <Image src={`/api/payment-methods/${method.id}/qr`} alt={`Current ${method.label} QR code`} width={160} height={160} unoptimized className="size-40 shrink-0 rounded-xl border border-border bg-white object-contain p-2" />
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="removeQr" className="size-5 rounded accent-foil-magenta" />
                Remove this QR
              </label>
            </div>
          ) : null}
          <Input id={id("qr")} name="qr" type="file" accept="image/png,image/jpeg,image/webp" className="h-auto py-3" aria-invalid={errors.qr ? true : undefined} aria-describedby={[describe("qr"), id("qr-hint")].filter(Boolean).join(" ")} />
          <p id={id("qr-hint")} className="text-sm text-muted-foreground">
            PNG, JPG or WebP, up to 1.5 MB. Members can view and download it. Choosing a file replaces the current one.
          </p>
          <FieldError id={`${id("qr")}-error`} message={errors.qr} />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input type="checkbox" name="isActive" defaultChecked={typed ? typed.isActive === "on" : method.isActive} className="size-5 rounded accent-foil-magenta" aria-describedby={describe("isActive")} />
            Show this to members
          </label>
          <FieldError id={`${id("isActive")}-error`} message={errors.isActive} />
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="text-sm font-semibold empty:hidden">
        {state.saved ? "Saved." : null}
      </p>
      <div>
        <Button type="submit" disabled={pending}>
          <Save data-icon="inline-start" />
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
