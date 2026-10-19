import type { Metadata } from "next";
import { getEnv } from "@/env";
import { requireAdmin } from "@/server/auth/session";
import { backupDirFor, listBackups } from "@/server/backup/backup";
import { getDb } from "@/server/db/client";
import { listJobRuns } from "@/server/jobs/runner";
import { BACKUP_JOB } from "@/server/jobs/schedule";
import { listPaymentMethods } from "@/server/payments/methods";
import { BackupsPanel } from "./backups-panel";
import { PaymentMethodForm } from "./payment-method-form";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requireAdmin();
  const db = getDb();
  const env = getEnv();
  const methods = listPaymentMethods(db, {});
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
    <div className="flex flex-col gap-12">
      <header>
        <h1 className="font-display text-5xl md:text-6xl">Settings</h1>
      </header>

      <section aria-labelledby="methods" className="flex max-w-3xl flex-col gap-2">
        <h2 id="methods" className="font-display text-4xl">
          Payment methods
        </h2>
        <p className="text-muted-foreground">
          Members pay these accounts outside the app, then report the payment here for you to verify. Only methods you
          switch on are shown to members.
        </p>
        <div className="flex flex-col divide-y divide-border">
          {methods.map((method) => (
            <section key={method.id} aria-labelledby={`method-${method.id}`} className="flex flex-col gap-5 py-8">
              <h3 id={`method-${method.id}`} className="font-display text-3xl">
                {method.label}
              </h3>
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
            </section>
          ))}
        </div>
      </section>

      <BackupsPanel backups={backups} listError={backupListError} runs={listJobRuns(db, BACKUP_JOB, 1)} dir={backupDir} keep={env.BACKUP_KEEP} />
    </div>
  );
}
