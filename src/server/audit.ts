import type { Db } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";

export interface AuditEntry {
  actorId: string | null;
  /** Dotted verb, e.g. "member.added", "statement.cancelled". */
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Append-only. Pass a transaction handle so the record commits or rolls back with the change. */
export function recordAudit(db: Db, entry: AuditEntry): void {
  db.insert(auditLogs)
    .values({
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: JSON.stringify(entry.metadata ?? {}),
    })
    .run();
}
