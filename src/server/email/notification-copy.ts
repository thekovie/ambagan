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
  "ADMIN_DUPLICATE_ATTEMPT",
  "PAYMENT_DETAILS_CHANGED",
  "TEST",
] as const satisfies readonly EmailType[];

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Pre-formatted display strings, stored as JSON on the queue row and rendered when the message is sent. */
export interface NotificationPayload {
  /** Recipient's display name; empty when they have none. */
  name: string;
  subscription?: string;
  /** "October 2026"; empty for an ambag, which has a title instead of a month. */
  period?: string;
  /** "1" when the statement is someone's share of an ambag bill. */
  isBill?: string;
  /** "₱75.50" */
  amount?: string;
  /** "₱20.00": the part of the amount that is late fees carried over from earlier months. */
  penalty?: string;
  dueDate?: string;
  /** Statement reference. */
  reference?: string;
  /** App-relative link target, joined to APP_URL when rendered. */
  path?: string;
  /** "1" when the reader has no account: the worker replaces `path` with their private link at send time. */
  shareLink?: string;
  /** Admin mails: who reported the payment. */
  memberName?: string;
  /** Admin mails: which of our accounts they say they paid. */
  destination?: string;
  transactionRef?: string;
  /** Decline reason. */
  reason?: string;
  /** Duplicate attempt: the member who reported the reference first. */
  otherMemberName?: string;
  /** Details change: what changed ("account number and QR code"), never the new values. */
  changed?: string;
  /** Details change: who changed it. */
  actorName?: string;
}

export interface NotificationCopy {
  subject: string;
  heading: string;
  body: string[];
  facts: [label: string, value: string][];
  cta?: { label: string; path: string };
}

const subjectLine = (p: NotificationPayload) => [p.subscription, p.period].filter(Boolean).join(" ");

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "your Spotify October 2026 share of ₱75.50" for a plan, "your ambag for Dinner (₱300.00)" for a bill. */
const yourShare = (p: NotificationPayload) =>
  p.isBill ? `your ambag for ${subjectLine(p)} (${p.amount})` : `your ${subjectLine(p)} share of ${p.amount}`;

function factsOf(p: NotificationPayload): [string, string][] {
  const rows: [string, string | undefined][] = [
    [p.isBill ? "Ambag" : "Plan", p.subscription],
    ["Month", p.period],
    ["Late fees (earlier months)", p.penalty],
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
      if (p.isBill) {
        return {
          subject: `Your ambag for ${p.subscription}: ${p.amount}`,
          heading: "Your ambag is ready",
          body: [`Your share of ${p.subscription} is ${p.amount}, due ${p.dueDate}.`],
          facts,
          cta: { label: "See your share", path: statementPath },
        };
      }
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
        body: [`A friendly nudge: ${yourShare(p)} is due tomorrow, ${p.dueDate}.`],
        facts,
        cta: { label: "Pay now", path: statementPath },
      };
    case "DUE_TODAY":
      return {
        subject: `Due today: ${what} (${p.amount})`,
        heading: "Due today",
        body: [`${capitalize(yourShare(p))} is due today.`],
        facts,
        cta: { label: "Pay now", path: statementPath },
      };
    case "OVERDUE":
      return {
        subject: `Overdue: ${what} (${p.amount})`,
        heading: "This one is overdue",
        body: [
          `${capitalize(yourShare(p))} was due ${p.dueDate}.`,
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
        // A guest has no payment history to sign in to: their private link (the only /s/ path) is where they follow it.
        cta: { label: "See payment history", path: p.path?.startsWith("/s/") ? p.path : "/payments" },
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
    case "ADMIN_DUPLICATE_ATTEMPT":
      return {
        subject: `${p.memberName} tried to report a reference already reported by ${p.otherMemberName}`,
        heading: "A reference was reported twice",
        body: [
          `${p.memberName} tried to report reference ${p.transactionRef} for ${what}, but ${p.otherMemberName} had already reported it.`,
          "Only one of them can have sent that payment. When you verify it, check in your own account who it actually came from.",
        ],
        facts,
        cta: { label: "Review payments", path: "/admin/payments" },
      };
    case "PAYMENT_DETAILS_CHANGED":
      return {
        subject: `${p.destination} payment details changed`,
        heading: "Payment details changed",
        body: [
          `The ${p.changed} for ${p.destination} was changed by ${p.actorName}.`,
          "Before you pay next time, check that the details shown in ambagan are right. If you weren't expecting this, tell the group admin.",
        ],
        facts: [],
        cta: { label: "See where to pay", path: "/dashboard" },
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
