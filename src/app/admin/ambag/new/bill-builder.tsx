"use client";

import { ArrowLeft, ArrowRight, HandCoins, TriangleAlert } from "lucide-react";
import { useActionState, useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMinor, parsePesosToMinor } from "@/lib/money";
import { buildItemsSplitInput, buildSplitInput, computeSplit, type DraftExtra, type DraftItem, type DraftMethod } from "@/lib/split";
import { cn } from "@/lib/utils";
import type { Participant } from "@/server/bills";
import { createBillAction, type CreateBillState } from "../actions";
import { GuestForm, type AddedGuest } from "../guest-form";
import { applyBillScan, pesosText } from "@/lib/ocr/apply-bill";
import type { BillScan } from "@/lib/ocr/parse-bill";
import { ItemsEditor } from "./items-editor";
import { Stepper } from "./stepper";
import { LAST_STEP, STEPS, stepBlocker, totalProblem } from "./steps";
import { formatDate } from "@/lib/dates";
import { endOfManilaDay } from "@/server/billing/dates";

type Method = DraftMethod | "ITEMS";

const METHODS: { value: Method; label: string; hint: string }[] = [
  { value: "EQUAL", label: "Equally", hint: "Everyone pays the same." },
  { value: "SHARES", label: "By shares", hint: "A couple counts as 2 shares, someone eating light as 1." },
  { value: "PERCENT", label: "By percent", hint: "Give each person a percentage. They must add up to 100%." },
  { value: "EXACT", label: "Exact amounts", hint: "Type what each person owes. It must add up to the total." },
  { value: "ITEMS", label: "By items", hint: "Each person pays for what they had, with tax, service and tip shared fairly. Best for a receipt." },
];

interface Row {
  included: boolean;
  shares: string;
  percent: string;
  amount: string;
}

const blank = (included: boolean): Row => ({ included, shares: "1", percent: "", amount: "" });

/** The announcement for screen readers waits for typing to settle, so they hear the state and not every keystroke. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

interface BillBuilderProps {
  /** The signed-in admin: the one who paid, whose own share is counted but never billed. */
  currentUserId: string;
  /** Made by the server page, so a refresh gives a new bill and a double submit is the same one. Also the rounding seed. */
  billId: string;
  defaultDueDate: string;
  people: Participant[];
}

export function BillBuilder({ currentUserId, billId, defaultDueDate, people: initialPeople }: BillBuilderProps) {
  const [state, action, pending] = useActionState<CreateBillState, FormData>(createBillAction, {});
  const uid = useId();
  const formId = `${uid}-form`;

  const [people, setPeople] = useState(initialPeople);
  const [rows, setRows] = useState<Record<string, Row>>(() => Object.fromEntries(initialPeople.map((p) => [p.id, blank(p.id === currentUserId)])));
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [totalText, setTotalText] = useState("");
  const [totalTouched, setTotalTouched] = useState(false);
  const [method, setMethod] = useState<Method>("EQUAL");
  const [items, setItems] = useState<DraftItem[]>(() => [{ id: "first-item", label: "", priceText: "", assignees: [] }]);
  const [extras, setExtras] = useState<DraftExtra[]>([]);
  const [receiptText, setReceiptText] = useState("");
  const [step, setStep] = useState(0);
  const arrived = useRef(false);

  // Moving to another step puts you at its top, with its heading read out, rather than leaving you mid-page.
  useEffect(() => {
    if (!arrived.current) {
      arrived.current = true;
      return;
    }
    document.getElementById(`${uid}-progress`)?.scrollIntoView({ block: "start" });
    document.getElementById(`${uid}-step-${step}`)?.focus({ preventScroll: true });
  }, [step, uid]);

  const update = (id: string, patch: Partial<Row>) => setRows((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const setAll = (included: boolean) => setRows((current) => Object.fromEntries(Object.entries(current).map(([id, row]) => [id, { ...row, included }])));
  const addGuest = useCallback((guest: AddedGuest) => {
    setPeople((current) => [...current, { id: guest.id, name: guest.name, email: guest.email, isGuest: true, isAdmin: false }]);
    setRows((current) => ({ ...current, [guest.id]: blank(true) }));
  }, []);

  const adminId = currentUserId;
  const included = people.filter((p) => rows[p.id]?.included);

  // The split as the server will see it, or why it cannot be built yet. Recomputed on every render: it is cheap
  // (at most 50 people), and building it in one shared place keeps the preview and the saved bill identical.
  const draftPeople = included.map((p) => ({ id: p.id, name: p.name, shares: rows[p.id].shares, percent: rows[p.id].percent, amount: rows[p.id].amount }));
  const draft =
    method === "ITEMS"
      ? buildItemsSplitInput({ people: draftPeople, items, extras, receiptText })
      : buildSplitInput({ method, totalText, people: draftPeople });

  // Functional updates, because a scan takes a while and the admin may keep typing meanwhile. The ids are made once
  // here so each update (React may run one twice) produces the same fields.
  function applyScan(scan: BillScan) {
    const ids = Array.from({ length: scan.items.length + scan.extras.length }, () => crypto.randomUUID());
    const idSource = () => {
      let n = 0;
      return () => ids[n++];
    };
    setItems((current) => applyBillScan({ items: current, extras: [] }, scan, idSource()).items);
    setExtras((current) => applyBillScan({ items: [], extras: current }, scan, idSource()).extras);
    if (scan.totalMinor !== null) setReceiptText(pesosText(scan.totalMinor));
  }

  const outcome = "input" in draft ? computeSplit(draft.input, billId) : null;
  const amounts = new Map(outcome?.ok ? outcome.result.shares.map((s) => [s.userId, s.amountMinor]) : []);
  const balance = outcome
    ? outcome.ok
      ? `Balanced: ${formatMinor(outcome.result.totalMinor, "PHP")} split between ${outcome.result.shares.filter((share) => share.amountMinor > 0).length}`
      : outcome.issues[0].message
    : "waiting" in draft
      ? draft.waiting
      : "";
  const announced = useSettled(balance, 600);

  const collecting = outcome?.ok ? outcome.result.shares.filter((s) => s.userId !== adminId && s.amountMinor > 0) : [];
  const ownShare = outcome?.ok ? (outcome.result.shares.find((s) => s.userId === adminId)?.amountMinor ?? 0) : 0;
  const ready = Boolean(outcome?.ok) && title.trim().length > 0 && dueDate.length > 0 && collecting.length > 0;
  const methodHint = METHODS.find((m) => m.value === method)?.hint;
  const blockerFor = (forStep: number) => stepBlocker(forStep, { title, includedCount: included.length, method, totalText });
  // The inline message waits until they leave the field, so it does not nag halfway through typing "1,500".
  const totalError = totalTouched ? totalProblem(method, totalText) : null;
  const dueLabel = (() => {
    const date = endOfManilaDay(dueDate);
    return date ? formatDate(date) : dueDate;
  })();
  const next = () => setStep((current) => Math.min(LAST_STEP, current + 1));
  const back = () => setStep((current) => Math.max(0, current - 1));

  return (
    <div className="flex flex-col gap-6">
      {/* Only hidden fields live in the real form: the visible ones are outside it, so the guest form can sit among them. */}
      <form id={formId} action={action}>
        <input type="hidden" name="billId" value={billId} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="note" value={note} />
        <input type="hidden" name="dueDate" value={dueDate} />
        <input type="hidden" name="split" value={"input" in draft ? JSON.stringify(draft.input) : "{}"} />
      </form>

      <div id={`${uid}-progress`} className="scroll-mt-20">
        <Stepper current={step} onGo={setStep} />
      </div>

      <section aria-labelledby={`${uid}-step-0`} hidden={step !== 0} className="sheet flex flex-col gap-5 p-5 sm:p-6">
        <h2 id={`${uid}-step-0`} tabIndex={-1} className="font-display text-title outline-none">
          {STEPS[0].heading}
        </h2>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-title`}>Name it so friends recognise it</Label>
          <Input id={`${uid}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoComplete="off" placeholder="Dinner at Gerry's" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {method === "ITEMS" ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">Total you paid</p>
              <p className="flex min-h-12 items-center text-lg font-bold tabular-nums">{outcome?.ok ? formatMinor(outcome.result.totalMinor, "PHP") : "Adds up from the items"}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${uid}-total`}>Total you paid (₱)</Label>
              <Input
                id={`${uid}-total`}
                value={totalText}
                onChange={(e) => setTotalText(e.target.value)}
                onBlur={() => setTotalTouched(true)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="1,500.00"
                aria-invalid={totalError ? true : undefined}
                aria-describedby={totalError ? `${uid}-total-error` : undefined}
              />
              {totalError ? (
                <p id={`${uid}-total-error`} role="alert" className="text-sm font-semibold text-destructive">
                  {totalError}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Splitting a receipt by items? Leave this blank: it adds up from the items.</p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${uid}-due`}>Everyone pays by</Label>
            <Input id={`${uid}-due`} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <details className="group" open={note.length > 0 || undefined}>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold underline underline-offset-4">Add a note for everyone (optional)</summary>
          <div className="mt-2 flex flex-col gap-2">
            <Label htmlFor={`${uid}-note`} className="sr-only">
              Note for everyone
            </Label>
            <Textarea id={`${uid}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="Salamat sa lahat!" />
          </div>
        </details>
        <StepNav onNext={next} blocker={blockerFor(0)} sticky={false} />
      </section>

      <section aria-labelledby={`${uid}-step-1`} hidden={step !== 1} className="sheet flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${uid}-step-1`} tabIndex={-1} className="font-display text-title outline-none">
            {STEPS[1].heading}
          </h2>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setAll(true)}>
              Everyone
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAll(false)}>
              Nobody
            </Button>
          </div>
        </div>
        <ul className="flex flex-col">
          {people.map((person) => (
            <li key={person.id}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-secondary">
                <input type="checkbox" className="size-5 accent-candy" checked={rows[person.id]?.included ?? false} onChange={(e) => update(person.id, { included: e.target.checked })} />
                <span className="font-semibold">{person.name}</span>
                {person.id === currentUserId ? <span className="rounded-full bg-st-lilac px-2.5 py-0.5 text-xs font-bold text-st-ink">You paid</span> : null}
                {person.isGuest ? <span className="rounded-full bg-st-butter px-2.5 py-0.5 text-xs font-bold text-st-ink">Guest</span> : null}
              </label>
            </li>
          ))}
        </ul>
        <GuestForm onAdded={addGuest} />
        <StepNav onBack={back} onNext={next} blocker={blockerFor(1)} />
      </section>

      <section aria-labelledby={`${uid}-step-2`} hidden={step !== 2} className="sheet flex flex-col gap-4 p-5 sm:p-6">
        <h2 id={`${uid}-step-2`} tabIndex={-1} className="font-display text-title outline-none">
          {STEPS[2].heading}
        </h2>
        <p className="text-sm text-muted-foreground">
          {title.trim()} · {outcome?.ok ? formatMinor(outcome.result.totalMinor, "PHP") : totalText.trim() ? `₱${totalText.trim()}` : "no total yet"} · {included.length}{" "}
          {included.length === 1 ? "person" : "people"} · due {dueLabel}
        </p>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Split method</legend>
          {METHODS.map((m) => (
            <label key={m.value} className="relative">
              <input type="radio" name={`${uid}-method`} value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} className="peer sr-only" />
              <span className="flex min-h-11 cursor-pointer items-center rounded-full border-2 border-input px-4 text-sm font-bold transition-colors peer-checked:border-transparent peer-checked:bg-st-lilac peer-checked:text-st-ink peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                {m.label}
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-muted-foreground">{methodHint}</p>

        {method === "ITEMS" ? (
          <ItemsEditor
            people={included.map((p) => ({ id: p.id, name: p.name }))}
            items={items}
            onItems={setItems}
            extras={extras}
            onExtras={setExtras}
            receiptText={receiptText}
            onReceipt={setReceiptText}
            onScanned={applyScan}
          />
        ) : null}

        {included.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border">
            {included.map((person) => {
              const row = rows[person.id];
              const amount = amounts.get(person.id);
              const typed = method === "EXACT" ? parsePesosToMinor(row.amount || "0") : null;
              return (
                <li key={person.id} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1 truncate font-semibold">{person.name}</span>
                  {method === "SHARES" ? (
                    <Input aria-label={`Shares for ${person.name}`} className="w-20 text-center" inputMode="numeric" value={row.shares} onChange={(e) => update(person.id, { shares: e.target.value })} />
                  ) : null}
                  {method === "PERCENT" ? (
                    <div className="flex items-center gap-1">
                      <Input aria-label={`Percent for ${person.name}`} className="w-24 text-right" inputMode="decimal" placeholder="0" value={row.percent} onChange={(e) => update(person.id, { percent: e.target.value })} />
                      <span aria-hidden="true" className="font-bold">
                        %
                      </span>
                    </div>
                  ) : null}
                  {method === "EXACT" ? (
                    <Input aria-label={`Amount for ${person.name} in pesos`} className="w-32 text-right" inputMode="decimal" placeholder="0.00" value={row.amount} onChange={(e) => update(person.id, { amount: e.target.value })} />
                  ) : null}
                  {/* A plain span, not <output>: output is an implicit live region and would announce every keystroke. */}
                  <span className="w-28 shrink-0 text-right font-bold tabular-nums">
                    <span className="sr-only">{person.name} owes </span>
                    {amount !== undefined ? formatMinor(amount, "PHP") : typed !== null && method === "EXACT" ? formatMinor(typed, "PHP") : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="summary" hidden={step !== 2} className="sheet flex flex-col gap-3 p-5 sm:p-6">
        <h2 id="summary" className="font-display text-title">
          Before you send
        </h2>
        {outcome?.ok ? (
          <p>
            You front <strong>{formatMinor(outcome.result.totalMinor, "PHP")}</strong>
            {ownShare > 0 ? <> and your own share is {formatMinor(ownShare, "PHP")}</> : null}. {collecting.length} {collecting.length === 1 ? "friend gets" : "friends get"} their own link and a reminder
            email (guests without an email get a link for you to share).
          </p>
        ) : (
          <p className="text-muted-foreground">Fill in the bill and who&apos;s in to see the summary.</p>
        )}
        {state.error ? (
          <p role="alert" className="flex items-start gap-2 font-semibold text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {state.error}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="lg" onClick={back}>
            <ArrowLeft data-icon="inline-start" /> Back
          </Button>
          <Button type="submit" form={formId} variant="candy" size="lg" disabled={!ready || pending}>
            <HandCoins data-icon="inline-start" /> {pending ? "Creating…" : "Create ambag"}
          </Button>
        </div>
      </section>

      {/* The one live region: it announces the state of the split (left to assign, balanced), not every keystroke. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announced}
      </p>
      <p
        aria-hidden="true"
        hidden={step !== 2}
        className={cn(
          "sticky bottom-24 z-10 mx-auto w-fit max-w-full rounded-full px-4 py-2 text-sm font-bold shadow-[var(--sh-dock)]",
          outcome?.ok ? "bg-st-mint text-st-ink" : "bg-card text-foreground ring-1 ring-border",
        )}
      >
        {balance}
      </p>
    </div>
  );
}

/** Back and Next at the foot of a step. When Next is not allowed yet, the reason is written next to it. */
function StepNav({ onBack, onNext, blocker, sticky = true }: { onBack?: () => void; onNext: () => void; blocker: string | null; sticky?: boolean }) {
  return (
    // Sticks just above the dock, so Next is never lost below a long list.
    <div className={cn("-mx-2 flex flex-col gap-2 rounded-3xl p-2", sticky && "sticky bottom-24 z-10 bg-card/95 backdrop-blur")}>
      {blocker ? <p className="px-2 text-sm text-muted-foreground">{blocker}</p> : null}
      <div className="flex items-center gap-3">
        {onBack ? (
          <Button type="button" variant="outline" size="lg" onClick={onBack}>
            <ArrowLeft data-icon="inline-start" /> Back
          </Button>
        ) : null}
        <Button type="button" variant="candy" size="lg" disabled={blocker !== null} onClick={onNext}>
          Next <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}
