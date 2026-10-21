"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { EXTRA_KINDS, type DraftExtra, type DraftItem, type ExtraKind } from "@/lib/split";
import type { BillScan } from "@/lib/ocr/parse-bill";
import { cn } from "@/lib/utils";
import { BillScanner } from "./bill-scanner";

interface Person {
  id: string;
  name: string;
}

interface ItemsEditorProps {
  /** Only the people who are in the split can share an item. */
  people: Person[];
  items: DraftItem[];
  /** React state setters (functional updates), so quick successive changes never overwrite each other. */
  onItems: Dispatch<SetStateAction<DraftItem[]>>;
  extras: DraftExtra[];
  onExtras: Dispatch<SetStateAction<DraftExtra[]>>;
  receiptText: string;
  onReceipt: (text: string) => void;
  /** A receipt was read: the builder puts it into the fields. */
  onScanned: (scan: BillScan) => void;
}

const EXTRA_LABEL: Record<ExtraKind, string> = {
  TAX: "Tax",
  SERVICE: "Service charge",
  TIP: "Tip",
  DELIVERY: "Delivery fee",
  DISCOUNT: "Discount",
  OTHER: "Other",
};

/** What a new extra starts as: tax and service are usually a percentage, delivery is shared equally, the rest are amounts. */
function newExtra(kind: ExtraKind): DraftExtra {
  return {
    id: crypto.randomUUID(),
    kind,
    label: "",
    mode: kind === "TAX" || kind === "SERVICE" ? "PERCENT" : "AMOUNT",
    valueText: kind === "TAX" ? "12" : kind === "SERVICE" ? "10" : "",
    allocate: kind === "DELIVERY" ? "EQUAL" : "PROPORTIONAL",
  };
}

const chip =
  "flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-bold transition-colors outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** The itemised form: each receipt line with the people who shared it, then tax, service, tip, delivery and discounts. */
export function ItemsEditor({ people, items, onItems, extras, onExtras, receiptText, onReceipt, onScanned }: ItemsEditorProps) {
  const patchItem = (id: string, patch: Partial<DraftItem>) => onItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const patchExtra = (id: string, patch: Partial<DraftExtra>) => onExtras((current) => current.map((extra) => (extra.id === id ? { ...extra, ...patch } : extra)));
  const toggle = (id: string, personId: string) =>
    onItems((current) =>
      current.map((item) =>
        item.id !== id ? item : { ...item, assignees: item.assignees.includes(personId) ? item.assignees.filter((a) => a !== personId) : [...item.assignees, personId] },
      ),
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="font-display text-xl">Items</h3>
        <BillScanner onScanned={onScanned} />
        <ul className="flex flex-col gap-3">
          {items.map((item, index) => {
            const name = item.label.trim() || `item ${index + 1}`;
            const everyone = people.length > 0 && people.every((p) => item.assignees.includes(p.id));
            return (
              <li key={item.id} className="flex flex-col gap-3 rounded-2xl border-2 border-border p-4">
                <div className="flex items-start gap-3">
                  <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_9rem]">
                    <Input aria-label={`Name of item ${index + 1}`} placeholder="Large pizza" maxLength={60} value={item.label} onChange={(e) => patchItem(item.id, { label: e.target.value })} />
                    <Input aria-label={`Price of ${name} in pesos`} inputMode="decimal" placeholder="600.00" className="text-right" value={item.priceText} onChange={(e) => patchItem(item.id, { priceText: e.target.value })} />
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => onItems((current) => current.filter((i) => i.id !== item.id))} aria-label={`Remove ${name}`}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <fieldset className="flex flex-wrap gap-2">
                  <legend className="mb-2 text-sm font-semibold text-muted-foreground">Who shared {name}?</legend>
                  <button
                    type="button"
                    aria-pressed={everyone}
                    onClick={() => patchItem(item.id, { assignees: everyone ? [] : people.map((p) => p.id) })}
                    className={cn(chip, everyone ? "border-transparent bg-st-lilac text-st-ink" : "border-input")}
                  >
                    Everyone
                  </button>
                  {people.map((person) => {
                    const on = item.assignees.includes(person.id);
                    return (
                      <button key={person.id} type="button" aria-pressed={on} onClick={() => toggle(item.id, person.id)} className={cn(chip, on ? "border-transparent bg-st-mint text-st-ink" : "border-input")}>
                        {person.name}
                      </button>
                    );
                  })}
                </fieldset>
              </li>
            );
          })}
        </ul>
        <div>
          <Button type="button" variant="secondary" onClick={() => onItems((current) => [...current, { id: crypto.randomUUID(), label: "", priceText: "", assignees: [] }])}>
            <Plus data-icon="inline-start" /> Add an item
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-display text-xl">Tax, service, tip and discounts</h3>
        <p className="text-sm text-muted-foreground">Shared in proportion to what each person had, except delivery, which is split equally. Percentages are of the items.</p>
        <ul className="flex flex-col gap-3">
          {extras.map((extra) => {
            const name = extra.kind === "OTHER" && extra.label.trim() ? extra.label.trim() : EXTRA_LABEL[extra.kind];
            return (
              <li key={extra.id} className="flex flex-col gap-3 rounded-2xl border-2 border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold">{EXTRA_LABEL[extra.kind]}</p>
                  <Button type="button" variant="ghost" size="icon" onClick={() => onExtras((current) => current.filter((e) => e.id !== extra.id))} aria-label={`Remove ${name}`}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_7rem_9rem]">
                  {extra.kind === "OTHER" ? <Input aria-label="What is this charge called?" placeholder="Corkage" maxLength={60} value={extra.label} onChange={(e) => patchExtra(extra.id, { label: e.target.value })} /> : <span className="hidden sm:block" />}
                  <NativeSelect aria-label={`${name}: peso amount or percent`} value={extra.mode} onChange={(e) => patchExtra(extra.id, { mode: e.target.value as DraftExtra["mode"] })}>
                    <option value="AMOUNT">₱ amount</option>
                    <option value="PERCENT">% of items</option>
                  </NativeSelect>
                  <Input aria-label={`${name} ${extra.mode === "PERCENT" ? "percent" : "amount in pesos"}`} inputMode="decimal" className="text-right" placeholder={extra.mode === "PERCENT" ? "10" : "0.00"} value={extra.valueText} onChange={(e) => patchExtra(extra.id, { valueText: e.target.value })} />
                </div>
                {extra.kind === "DISCOUNT" ? null : (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`allocate-${extra.id}`} className="text-sm text-muted-foreground">
                      How is {name.toLowerCase()} shared?
                    </Label>
                    <NativeSelect id={`allocate-${extra.id}`} value={extra.allocate} onChange={(e) => patchExtra(extra.id, { allocate: e.target.value as DraftExtra["allocate"] })}>
                      <option value="PROPORTIONAL">By what each person had</option>
                      <option value="EQUAL">Equally between everyone</option>
                    </NativeSelect>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Add a charge or discount">
          {EXTRA_KINDS.map((kind) => (
            <Button key={kind} type="button" variant="outline" size="sm" onClick={() => onExtras((current) => [...current, newExtra(kind)])}>
              <Plus data-icon="inline-start" /> {EXTRA_LABEL[kind]}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="receipt-total">Total on the receipt (optional)</Label>
        <Input id="receipt-total" inputMode="decimal" placeholder="1,500.00" value={receiptText} onChange={(e) => onReceipt(e.target.value)} className="sm:w-56" />
        <p className="text-sm text-muted-foreground">If you type it, we check that the items and extras add up to it, so a missing line doesn&apos;t slip through.</p>
      </div>
    </div>
  );
}
