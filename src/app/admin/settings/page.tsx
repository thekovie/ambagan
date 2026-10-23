import type { Metadata } from "next";
import { getEnv } from "@/env";
import { requireAdmin } from "@/server/auth/session";
import { backupDirFor, listBackups } from "@/server/backup/backup";
import { getDb } from "@/server/db/client";
import { listJobRuns } from "@/server/jobs/runner";
import { BACKUP_JOB } from "@/server/jobs/schedule";
import { listPaymentMethods, usedMethodIds } from "@/server/payments/methods";
import { AddMethodForm } from "./add-method-form";
import { BackupsPanel } from "./backups-panel";
import { DeleteMethodForm } from "./delete-method-form";
import { PaymentMethodForm } from "./payment-method-form";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ added?: string }> }) {
  await requireAdmin();
  const { added } = await searchParams;
  const db = getDb();
  const env = getEnv();
  const methods = listPaymentMethods(db, {});
  const used = usedMethodIds(db);
  const backupDir = backupDirFor(env);
  // An unreadable backup folder must not take the whole settings page down: say so in the panel instead.
  let backups: ReturnType<typeof listBackups> = [];
  let backupListError: string | undefined;
  try {
    backups = listBackups(backupDir);
  } catch {
    backupListError = "The backup folder can't be read. Check its permissions.";
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-display">Settings</h1>
      </header>

      <section aria-labelledby="methods" className="flex max-w-3xl flex-col gap-2">
        <h2 id="methods" className="font-display text-title">
          Payment methods
        </h2>
        <p className="text-muted-foreground">
          Members pay these accounts outside the app, then report the payment here for you to verify. Only methods you
          switch on are shown to members.
        </p>
        <div className="flex flex-col gap-6">
          <AddMethodForm existing={methods.map((method) => method.label)} />
          {methods.length === 0 ? <p className="text-muted-foreground">Nothing yet. Add GCash, Maya, a bank account, or whatever your friends use to pay you.</p> : null}
          {methods.map((method) => (
            // Switched-on methods are open; the others are one tidy row until you want to set them up.
            <section key={method.id} aria-labelledby={`method-${method.id}`} className="sheet">
              <details open={method.id === added || undefined} className="group">
                <summary className="flex min-h-16 cursor-pointer items-center justify-between gap-3 p-5 sm:px-6">
                  <h3 id={`method-${method.id}`} className="font-display text-title">
                    {method.label}
                  </h3>
                  <span className={method.isActive ? "rounded-full bg-st-mint px-3 py-1 text-xs font-bold text-st-ink" : "rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground"}>
                    {method.isActive ? "Shown to members" : "Off · set up"}
                  </span>
                </summary>
                <div className="flex flex-col gap-5 px-5 pb-5 sm:px-6 sm:pb-6">
                  <PaymentMethodForm
                    method={{
                      id: method.id,
                      label: method.label,
                      accountName: method.accountName,
                      accountNumber: method.accountNumber,
                      instructions: method.instructions,
                      isActive: method.isActive,
                      hasQr: Boolean(method.qrFile),
                    }}
                  />
                  <DeleteMethodForm id={method.id} label={method.label} canDelete={!used.has(method.id)} />
                </div>
              </details>
            </section>
          ))}
        </div>
      </section>

      <BackupsPanel backups={backups} listError={backupListError} runs={listJobRuns(db, BACKUP_JOB, 1)} dir={backupDir} keep={env.BACKUP_KEEP} />
    </div>
  );
}
