import "server-only";
import { getEnv } from "@/env";
import { assetsDir } from "@/server/assets/store";
import { getDb } from "@/server/db/client";
import { runJob, type JobResult } from "@/server/jobs/runner";
import { BACKUP_JOB } from "@/server/jobs/schedule";
import { backupDirFor, createBackup } from "./backup";

export type BackupSummary = { name: string; sizeBytes: number; pruned: number };

/** Takes a backup through the job runner: once per Manila day when scheduled, recorded either way. */
export function runBackupJob(trigger: "SCHEDULED" | "MANUAL", now: Date = new Date()): Promise<JobResult<BackupSummary>> {
  const env = getEnv();
  return runJob(
    getDb(),
    BACKUP_JOB,
    trigger,
    async () => {
      const backup = await createBackup(getDb(), { dir: backupDirFor(env), assetsDir: assetsDir(), now, keep: env.BACKUP_KEEP });
      if (backup.pruneError) console.error("Backup taken, but old backups could not be removed:", backup.pruneError);
      return { name: backup.name, sizeBytes: backup.sizeBytes, pruned: backup.pruned.length };
    },
    now,
  );
}
