import { TriangleAlert } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import type { BackupInfo } from "@/server/backup/backup";
import type { JobRun } from "@/server/jobs/runner";
import { BackupButton } from "./backup-button";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface BackupsPanelProps {
  backups: BackupInfo[];
  /** Set when the backup folder could not be read. */
  listError?: string;
  /** Recent runs of the backup job, newest first. */
  runs: JobRun[];
  dir: string;
  keep: number;
}

/** Daily backups: what exists, whether the last one worked, and a manual trigger. */
export function BackupsPanel({ backups, listError, runs, dir, keep }: BackupsPanelProps) {
  const lastRun = runs[0];
  const lastFailed = lastRun?.status === "FAILED";

  return (
    <section aria-labelledby="backups" className="flex max-w-3xl flex-col gap-4">
      <h2 id="backups" className="font-display text-4xl">
        Backups
      </h2>
      <p className="text-muted-foreground">
        ambagan backs up the database and your QR images every day, checks each copy before trusting it, and keeps the
        latest {keep}. They are stored in <code className="font-mono text-foreground">{dir}</code>.
      </p>
      <p className="flex items-start gap-2 rounded-xl bg-st-butter p-3 text-sm font-bold text-st-ink">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          That is on the same machine as the live data, so it protects you from mistakes and bad updates, not from losing
          the machine. Copy the folder somewhere else regularly (see the deployment guide).
        </span>
      </p>

      {lastFailed ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          The last automatic backup failed ({formatDateTime(lastRun.startedAt)}): {lastRun.error}
        </p>
      ) : null}

      <BackupButton />

      {listError ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {listError}
        </p>
      ) : null}

      {backups.length === 0 && !listError ? (
        <p className="text-sm text-muted-foreground">No backups yet. The first one is taken at the next daily run.</p>
      ) : backups.length === 0 ? null : (
        <ul className="divide-y divide-border text-sm">
          {backups.map((backup) => (
            <li key={backup.name} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="font-semibold">{formatDateTime(backup.createdAt)}</span>
              <span className="text-muted-foreground">
                <span className="font-mono">{backup.name}</span> · {formatBytes(backup.sizeBytes)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
