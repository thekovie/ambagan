"use client";

import { DatabaseBackup } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { backUpNowAction, type BackupState } from "./actions";

export function BackupButton() {
  const [state, action, pending] = useActionState<BackupState>(backUpNowAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <Button type="submit" variant="secondary" disabled={pending}>
        <DatabaseBackup data-icon="inline-start" />
        {pending ? "Backing up…" : "Back up now"}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-sm font-semibold">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
