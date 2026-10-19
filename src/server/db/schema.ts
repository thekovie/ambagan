import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** Enum values live here so app code, zod schemas and the DB share one source. */
export const ROLES = ["MEMBER", "ADMIN"] as const;
export const STATEMENT_STATUSES = ["UNPAID", "UNDER_VERIFICATION", "PAID", "OVERDUE", "CANCELLED"] as const;
export const PAYMENT_STATUSES = ["PENDING", "APPROVED", "DECLINED"] as const;
export const PAYMENT_METHOD_KINDS = ["GCASH", "MAYA", "MARIBANK"] as const;
export const EMAIL_TYPES = [
  "INVITATION",
  "LOGIN",
  "SOA_GENERATED",
  "DUE_TOMORROW",
  "DUE_TODAY",
  "OVERDUE",
  "PAYMENT_RECEIVED",
  "ADMIN_VERIFY_REQUEST",
  "PAYMENT_APPROVED",
  "PAYMENT_DECLINED",
  "TEST",
] as const;
// SENT = accepted by SMTP; we never claim DELIVERED (no delivery receipts).
export const EMAIL_STATUSES = ["PENDING", "SENDING", "SENT", "FAILED"] as const;
export const JOB_STATUSES = ["RUNNING", "SUCCEEDED", "FAILED"] as const;

export type Role = (typeof ROLES)[number];
export type StatementStatus = (typeof STATEMENT_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];
export type EmailType = (typeof EMAIL_TYPES)[number];
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

// ---- Users & Auth.js tables (shape required by @auth/drizzle-adapter) ----

export const users = sqliteTable("user", {
  id: id(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  role: text("role", { enum: ROLES }).notNull().default("MEMBER"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const accounts = sqliteTable(
  "account",
  {
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = sqliteTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/** Admin-issued invitation. Only the SHA-256 of the token is stored. */
export const invitations = sqliteTable(
  "invitation",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("invitation_user_idx").on(t.userId)],
);

// ---- Billing ----

export const subscriptions = sqliteTable("subscription", {
  id: id(),
  name: text("name").notNull(),
  /** Prefix for statement references, e.g. SPOT -> SPOT-202610-A1B2C3. */
  refPrefix: text("ref_prefix").notNull().unique(),
  /** Current fee in minor units (centavos). Statements snapshot this at issue time. */
  feeMinor: integer("fee_minor").notNull(),
  currency: text("currency").notNull().default("PHP"),
  /** Day of month statements are issued / due (Asia/Manila). */
  issueDay: integer("issue_day").notNull().default(1),
  dueDay: integer("due_day").notNull().default(10),
  paymentInstructions: text("payment_instructions"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const memberships = sqliteTable(
  "membership",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    /** First billing period (YYYY-MM) this membership is charged for. */
    startPeriod: text("start_period").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("membership_user_sub_uq").on(t.userId, t.subscriptionId)],
);

export const statements = sqliteTable(
  "statement",
  {
    id: id(),
    reference: text("reference").notNull().unique(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
    /** Billing cycle as YYYY-MM. */
    period: text("period").notNull(),
    /** Snapshots: later fee/name changes never alter issued statements. */
    subscriptionName: text("subscription_name").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    outstandingMinor: integer("outstanding_minor").notNull(),
    currency: text("currency").notNull(),
    issuedAt: integer("issued_at", { mode: "timestamp_ms" }).notNull(),
    dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status", { enum: STATEMENT_STATUSES }).notNull().default("UNPAID"),
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
    cancelReason: text("cancel_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("statement_cycle_uq").on(t.userId, t.subscriptionId, t.period),
    index("statement_status_due_idx").on(t.status, t.dueAt),
    index("statement_user_idx").on(t.userId, t.period),
  ],
);

// ---- Payments ----

export const paymentMethods = sqliteTable("payment_method", {
  id: id(),
  kind: text("kind", { enum: PAYMENT_METHOD_KINDS }).notNull().unique(),
  label: text("label").notNull(),
  accountName: text("account_name"),
  accountNumber: text("account_number"),
  /** Filename inside the persistent assets dir; served only through an authorized route. */
  qrFile: text("qr_file"),
  qrMime: text("qr_mime"),
  instructions: text("instructions"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const payments = sqliteTable(
  "payment",
  {
    id: id(),
    statementId: text("statement_id").notNull().references(() => statements.id, { onDelete: "restrict" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    /** Where the money was sent (our account) vs. the app it was sent from — stored separately. */
    destinationMethodId: text("destination_method_id").notNull().references(() => paymentMethods.id, { onDelete: "restrict" }),
    sendingApp: text("sending_app").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    transactionRef: text("transaction_ref").notNull(),
    /** Uppercased, alphanumeric-only copy used for duplicate detection. */
    transactionRefNorm: text("transaction_ref_norm").notNull(),
    transactionDate: integer("transaction_date", { mode: "timestamp_ms" }).notNull(),
    notes: text("notes"),
    status: text("status", { enum: PAYMENT_STATUSES }).notNull().default("PENDING"),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
    declineReason: text("decline_reason"),
    /** Required when an admin approves an amount different from the statement. */
    adjustmentNote: text("adjustment_note"),
  },
  (t) => [
    index("payment_statement_idx").on(t.statementId),
    index("payment_ref_idx").on(t.transactionRefNorm),
    index("payment_status_idx").on(t.status, t.submittedAt),
  ],
);

// ---- Notifications, audit, jobs, settings ----

export const emailLogs = sqliteTable(
  "email_log",
  {
    id: id(),
    type: text("type", { enum: EMAIL_TYPES }).notNull(),
    toEmail: text("to_email").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    statementId: text("statement_id").references(() => statements.id, { onDelete: "set null" }),
    subject: text("subject").notNull(),
    /** JSON props for the template; rendered at send time. */
    payload: text("payload").notNull().default("{}"),
    /** Prevents duplicate queueing, e.g. "DUE_TODAY:<statementId>". */
    dedupeKey: text("dedupe_key").notNull().unique(),
    status: text("status", { enum: EMAIL_STATUSES }).notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("email_queue_idx").on(t.status, t.nextAttemptAt)],
);

export const auditLogs = sqliteTable(
  "audit_log",
  {
    id: id(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_created_idx").on(t.createdAt)],
);

export const jobRuns = sqliteTable(
  "job_run",
  {
    id: id(),
    job: text("job").notNull(),
    trigger: text("trigger", { enum: ["SCHEDULED", "MANUAL"] }).notNull(),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("RUNNING"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    summary: text("summary").notNull().default("{}"),
    error: text("error"),
  },
  (t) => [index("job_run_idx").on(t.job, t.startedAt)],
);

export const settings = sqliteTable("setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
