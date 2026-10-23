"use client";

import { ScanLine, Send, TriangleAlert } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatMinor, parsePesosToMinor } from "@/lib/money";
import { useFocusFirstError } from "@/lib/use-focus-first-error";
import { applyReceipt, detectedFields, type DetectedField } from "@/lib/ocr/apply";
import type { ParsedReceipt } from "@/lib/ocr/parse";
import { cn } from "@/lib/utils";
import type { PaymentFormState } from "@/server/payments/form-data";

export interface MethodOption {
  id: string;
  label: string;
  accountName: string | null;
}

/** Reports the payment. Members and private-link holders pass their own (the link one ignores the statement id). */
export type PaymentFormAction = (prev: PaymentFormState, formData: FormData) => Promise<PaymentFormState>;

interface PaymentFormProps {
  action: PaymentFormAction;
  statementId: string;
  currency: string;
  outstandingMinor: number;
  methods: MethodOption[];
  /** "YYYY-MM-DDTHH:mm" in Manila time. */
  defaultDate: string;
}

const APPS = ["GCash", "Maya", "MariBank", "GoTyme", "BPI", "BDO", "UnionBank", "Landbank", "Other"];

/** Shown under a field the receipt scan filled in, until the member edits it. */
function FromReceipt({ show }: { show: boolean }) {
  return show ? (
    <p className="flex items-center gap-2 text-sm font-semibold">
      <ScanLine className="size-4 shrink-0" aria-hidden="true" />
      Read from your receipt. Please check it.
    </p>
  ) : null;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="text-sm font-semibold text-destructive">
      {message}
    </p>
  ) : null;
}

export function PaymentForm({ action: submit, statementId, currency, outstandingMinor, methods, defaultDate }: PaymentFormProps) {
  const [state, action, pending] = useActionState<PaymentFormState, FormData>(submit, {});
  const formRef = useFocusFirstError(state);
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;
  const errors = state.errors ?? {};
  const bad = (field: string) => (errors[field] ? true : undefined);
  const describe = (field: string) => (errors[field] ? `${id(field)}-error` : undefined);

  // Controlled so a receipt scan can fill the fields, and so nothing typed is lost after an error.
  const [fields, setFields] = useState({
    destination: methods[0]?.id ?? "",
    app: APPS[0],
    appOther: "",
    amount: (outstandingMinor / 100).toFixed(2),
    reference: "",
    date: defaultDate,
    notes: "",
  });
  const [detected, setDetected] = useState<DetectedField[]>([]);
  const set = (key: keyof typeof fields) => (event: { target: { value: string } }) => {
    setFields((current) => ({ ...current, [key]: event.target.value }));
    // Once the member edits a scanned value it is theirs: drop the "please check" caption.
    setDetected((current) => current.filter((field) => field !== key));
  };
  const onDetected = (parsed: ParsedReceipt) => {
    setFields((current) => applyReceipt(current, parsed, APPS).fields);
    setDetected(detectedFields(parsed, APPS));
  };

  const typedMinor = parsePesosToMinor(fields.amount);
  const amountDiffers = typedMinor !== null && typedMinor !== outstandingMinor;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-7">
      <input type="hidden" name="statementId" value={statementId} />

      <ReceiptScanner knownApps={APPS} onDetected={onDetected} />

      {methods.length === 1 ? (
        // Only one place to pay: nothing to choose, so nothing to ask.
        <input type="hidden" name="destinationMethodId" value={methods[0].id} />
      ) : (
        <fieldset className="flex flex-col gap-3" aria-describedby={describe("destinationMethodId")}>
          <legend className="mb-1 text-sm font-semibold">Where did you send it?</legend>
          {methods.map((method) => (
            <label
              key={method.id}
              className={cn(
                "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/40",
                fields.destination === method.id ? "border-foreground bg-secondary" : "border-input",
              )}
            >
              <input
                type="radio"
                name="destinationMethodId"
                value={method.id}
                checked={fields.destination === method.id}
                onChange={set("destination")}
                className="size-5 accent-candy"
              />
              <span>
                <span className="block font-bold">{method.label}</span>
                {method.accountName ? <span className="block text-sm text-muted-foreground">{method.accountName}</span> : null}
              </span>
            </label>
          ))}
          <FieldError id={`${id("destinationMethodId")}-error`} message={errors.destinationMethodId} />
        </fieldset>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor={id("reference")}>Reference number</Label>
          <Input
            id={id("reference")}
            name="transactionRef"
            required
            value={fields.reference}
            onChange={set("reference")}
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={64}
            placeholder="From your receipt"
            aria-invalid={bad("transactionRef")}
            aria-describedby={describe("transactionRef")}
          />
          <FromReceipt show={detected.includes("reference")} />
          <FieldError id={`${id("transactionRef")}-error`} message={errors.transactionRef} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={id("app")}>Paid from</Label>
          <NativeSelect
            id={id("app")}
            name="sendingAppChoice"
            value={fields.app}
            onChange={set("app")}
            aria-invalid={bad("sendingApp")}
            aria-describedby={describe("sendingApp")}
          >
            {APPS.map((app) => (
              <option key={app} value={app}>
                {app === "Other" ? "Another app or bank" : app}
              </option>
            ))}
          </NativeSelect>
          <FromReceipt show={detected.includes("app")} />
          <FieldError id={`${id("sendingApp")}-error`} message={errors.sendingApp} />
        </div>

        {fields.app === "Other" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("appOther")}>Which one?</Label>
            <Input
              id={id("appOther")}
              name="sendingAppOther"
              value={fields.appOther}
              onChange={set("appOther")}
              maxLength={40}
              autoComplete="off"
              aria-invalid={bad("sendingAppOther")}
              aria-describedby={describe("sendingAppOther")}
            />
            <FieldError id={`${id("sendingAppOther")}-error`} message={errors.sendingAppOther} />
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor={id("amount")}>Amount sent (₱)</Label>
          <Input
            id={id("amount")}
            name="amountPesos"
            required
            inputMode="decimal"
            autoComplete="off"
            value={fields.amount}
            onChange={set("amount")}
            aria-invalid={bad("amountPesos")}
            aria-describedby={[describe("amountPesos"), amountDiffers ? id("amount-hint") : undefined].filter(Boolean).join(" ") || undefined}
          />
          {amountDiffers ? (
            <p id={id("amount-hint")} className="flex items-start gap-2 text-sm text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              This differs from the {formatMinor(outstandingMinor, currency)} due. You can still send it; the admin will review.
            </p>
          ) : null}
          <FromReceipt show={detected.includes("amount")} />
          <FieldError id={`${id("amountPesos")}-error`} message={errors.amountPesos} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={id("date")}>Date and time</Label>
          <Input
            id={id("date")}
            name="transactionDate"
            type="datetime-local"
            value={fields.date}
            onChange={set("date")}
            aria-invalid={bad("transactionDate")}
            aria-describedby={describe("transactionDate")}
          />
          <FromReceipt show={detected.includes("date")} />
          <FieldError id={`${id("transactionDate")}-error`} message={errors.transactionDate} />
        </div>

        <details className="sm:col-span-2" open={fields.notes.length > 0 || errors.notes ? true : undefined}>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold underline underline-offset-4">Add a note for the admin (optional)</summary>
          <div className="mt-2 flex flex-col gap-2">
            <Label htmlFor={id("notes")} className="sr-only">
              Note for the admin
            </Label>
            <Textarea
              id={id("notes")}
              name="notes"
              value={fields.notes}
              onChange={set("notes")}
              maxLength={300}
              className="min-h-20"
              aria-invalid={bad("notes")}
              aria-describedby={describe("notes")}
            />
            <FieldError id={`${id("notes")}-error`} message={errors.notes} />
          </div>
        </details>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button type="submit" variant="candy" size="lg" disabled={pending} className="w-full sm:w-auto">
          <Send data-icon="inline-start" />
          {pending ? "Sending…" : "Send for checking"}
        </Button>
        <p className="text-sm text-muted-foreground">
          The admin will confirm the money arrived. Nothing is marked paid until then. We don&apos;t keep a copy of your receipt.
        </p>
      </div>
    </form>
  );
}
