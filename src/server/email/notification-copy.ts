import type { EmailType } from "@/lib/enums";

/** Everything the app sends through the queue. Sign-in and invitation mail is sent directly instead. */
export const NOTIFICATION_TYPES = [
  "SOA_GENERATED",
  "DUE_TOMORROW",
  "DUE_TODAY",
  "OVERDUE",
  "PAYMENT_RECEIVED",
  "ADMIN_VERIFY_REQUEST",
  "PAYMENT_APPROVED",
  "PAYMENT_DECLINED",
  "TEST",
] as const satisfies readonly EmailType[];

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Pre-formatted display strings, stored as JSON on the queue row and rendered when the message is sent. */
export interface NotificationPayload {
  /** Recipient's display name; empty when they have none. */
  name: string;
  subscription?: string;
  /** "October 2026" */
  period?: string;
  /** "₱75.50" */
  amount?: string;
  dueDate?: string;
  /** Statement reference. */
  reference?: string;
  /** App-relative link target, joined to APP_URL when rendered. */
  path?: string;
  /** Admin mails: who reported the payment. */
  memberName?: string;
  /** Admin mails: which of our accounts they say they paid. */
  destination?: string;
  transactionRef?: string;
  /** Decline reason. */
  reason?: string;
}

export interface NotificationCopy {
  subject: string;
  heading: string;
  body: string[];
  facts: [label: string, value: string][];
  cta?: { label: string; path: string };
}

const subjectLine = (p: NotificationPayload) => [p.subscription, p.period].filter(Boolean).join(" ");

function factsOf(p: NotificationPayload): [string, string][] {
  const rows: [string, string | undefined][] = [
    ["Plan", p.subscription],
    ["Month", p.period],
    ["Amount", p.amount],
    ["Due", p.dueDate],
    ["Statement", p.reference],
  ];
  return rows.filter((row): row is [string, string] => Boolean(row[1]));
}

/** The words for every notification. Plain strings only: the renderer is responsible for escaping. */
export function copyFor(type: NotificationType, p: NotificationPayload): NotificationCopy {
  const what = subjectLine(p);
  const statementPath = p.path ?? "/statements";
  const facts = factsOf(p);

  switch (type) {
    case "SOA_GENERATED":
      return {
        subject: `Your ${p.subscription} statement for ${p.period}: ${p.amount}`,
        heading: "Your statement is ready",
        body: [`Your ${p.subscription} share for ${p.period} is ${p.amount}, due ${p.dueDate}.`],
        facts,
        cta: { label: "View statement", path: statementPath },
      };
    case "DUE_TOMORROW":
      return {
        subject: `Due tomorrow: ${what} (${p.amount})`,
        heading: "Due tomorrow",
        body: [`A friendly nudge: your ${what} share of ${p.amount} is due tomorrow, ${p.dueDate}.`],
        facts,
        cta: { label: "Pay now", path: statementPath },
      };
    case "DUE_TODAY":
      return {
        subject: `Due today: ${what} (${p.amount})`,
        heading: "Due today",
        body: [`Your ${what} share of ${p.amount} is due today.`],
        facts,
        cta: { label: "Pay now", path: statementPath },
      };
    case "OVERDUE":
      return {
        subject: `Overdue: ${what} (${p.amount})`,
        heading: "This one is overdue",
        body: [
          `Your ${what} share of ${p.amount} was due ${p.dueDate}.`,
          "Paid already? Report it so the admin can check and mark it done.",
        ],
        facts,
        cta: { label: "Pay or report it", path: statementPath },
      };
    case "PAYMENT_RECEIVED":
      return {
        subject: `We got your payment report for ${what}`,
        heading: "Payment reported",
        body: [
          `Thanks! We got your report of ${p.amount} for ${what}.`,
          "The admin will check that the money arrived in the account. We'll email you once it's confirmed.",
        ],
        facts,
        cta: { label: "See payment history", path: "/payments" },
      };
    case "ADMIN_VERIFY_REQUEST":
      return {
        subject: `${p.memberName} reported a payment of ${p.amount}`,
        heading: "A payment needs checking",
        body: [
          `${p.memberName} says they paid ${p.amount} for ${what}${p.destination ? ` to your ${p.destination}` : ""}.`,
          `Look for reference ${p.transactionRef} in that account, then approve or decline it. No receipt is kept, so your own account is the evidence.`,
        ],
        facts,
        cta: { label: "Review payment", path: "/admin/payments" },
      };
    case "PAYMENT_APPROVED":
      return {
        subject: `Payment confirmed: ${what}`,
        heading: "Payment confirmed",
        body: [`Thanks! Your ${what} payment of ${p.amount} is confirmed and the statement is marked paid.`],
        facts,
        cta: { label: "View statement", path: statementPath },
      };
    case "PAYMENT_DECLINED":
      return {
        subject: `We couldn't confirm your ${what} payment`,
        heading: "We couldn't confirm that payment",
        body: [
          `The admin couldn't confirm your ${p.amount} payment for ${what}.`,
          `Their note: ${p.reason}`,
          "If you did pay, report it again with the right details and it'll be checked again.",
        ],
        facts,
        cta: { label: "Report it again", path: statementPath },
      };
    case "TEST":
      return {
        subject: "ambagan test email",
        heading: "It works",
        body: ["This is a test message from ambagan. If you can read it, email is set up correctly."],
        facts: [],
      };
  }
}
