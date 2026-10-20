/** Enum values shared by app code, zod schemas and the DB. Pure module: safe for client bundles. */
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
  "ADMIN_DUPLICATE_ATTEMPT",
  "PAYMENT_DETAILS_CHANGED",
  "TEST",
] as const;
// SENT = accepted by SMTP; we never claim DELIVERED (no delivery receipts).
// SKIPPED = no longer worth sending by the time it came up (paid meanwhile, member deactivated): never sent.
export const EMAIL_STATUSES = ["PENDING", "SENDING", "SENT", "FAILED", "SKIPPED"] as const;
export const JOB_STATUSES = ["RUNNING", "SUCCEEDED", "FAILED"] as const;

export type Role = (typeof ROLES)[number];
export type StatementStatus = (typeof STATEMENT_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];
export type EmailType = (typeof EMAIL_TYPES)[number];
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
