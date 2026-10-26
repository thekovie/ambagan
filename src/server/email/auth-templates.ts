import { renderEmail } from "./email-frame";

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

export function loginEmail({ url }: { url: string }): MailContent {
  const { html, text } = renderEmail({
    preview: "Your sign-in link is inside. It works once.",
    tone: "sky",
    badge: "🔑 Sign-in link",
    heading: "Ready when you are",
    paragraphs: ["Tap the button to sign in to ambagan. The link works once and expires in 30 minutes."],
    cta: { label: "Sign in", url },
    footnote: "Didn't ask for this? You can ignore this email.",
  });
  return { subject: "Your ambagan sign-in link", text, html };
}

export function invitationEmail({ name, url, invitedBy }: { name: string | null; url: string; invitedBy?: string | null }): MailContent {
  // A named sender reads as a person writing to a friend, which spam filters (and people) trust more than an anonymous link.
  const inviter = invitedBy?.trim();
  const { html, text } = renderEmail({
    preview: "You've been invited to split things with the group.",
    tone: "mint",
    badge: "💌 You're invited",
    heading: "You're on the list",
    greeting: `Hi ${name?.trim() || "there"},`,
    paragraphs: [`${inviter ? `${inviter} invited you to` : "You've been invited to"} ambagan, where the group tracks and settles shared subscriptions and bills.`],
    cta: { label: "Accept invitation", url },
    footnote: "This invitation link expires in 7 days. Not expecting it? You can ignore this email.",
  });
  return { subject: inviter ? `${inviter} invited you to ambagan` : "You're invited to ambagan", text, html };
}
