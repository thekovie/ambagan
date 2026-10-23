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

export function invitationEmail({ name, url }: { name: string | null; url: string }): MailContent {
  const { html, text } = renderEmail({
    preview: "You've been invited to split things with the group.",
    tone: "mint",
    badge: "💌 You're invited",
    heading: "You're on the list",
    greeting: `Hi ${name?.trim() || "there"},`,
    paragraphs: ["You've been invited to ambagan, where the group tracks and settles shared subscriptions and bills."],
    cta: { label: "Accept invitation", url },
    footnote: "This invitation link expires in 7 days.",
  });
  return { subject: "You're invited to ambagan", text, html };
}
