export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c]);

// Email clients ignore external CSS and most modern features: inline styles, table layout, hex colours.
const INK = "#1c1530";
const PAPER = "#f6f5fa";
const MAGENTA = "#d1005a";

function shell(heading: string, paragraphs: string[], cta: { label: string; url: string }, footnote: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${p}</p>`).join("");
  return `<!doctype html><html lang="en"><body style="margin:0;background:${PAPER};font-family:Arial,Helvetica,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px">
<tr><td style="padding:28px 28px 8px;font-size:22px;font-weight:800;letter-spacing:-0.5px">ambagan</td></tr>
<tr><td style="padding:8px 28px 0"><h1 style="margin:0 0 16px;font-size:26px;line-height:1.15">${escapeHtml(heading)}</h1>${body}
<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${MAGENTA};color:#ffffff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px">${escapeHtml(cta.label)}</a></p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#5b5470">If the button doesn't work, paste this link into your browser:<br><a href="${escapeHtml(cta.url)}" style="color:#5b5470;word-break:break-all">${escapeHtml(cta.url)}</a></p>
<p style="margin:0 0 28px;font-size:13px;line-height:1.5;color:#5b5470">${escapeHtml(footnote)}</p></td></tr>
</table></td></tr></table></body></html>`;
}

export function loginEmail({ url }: { url: string }): MailContent {
  const footnote = "If you didn't ask for this, you can ignore this email.";
  return {
    subject: "Your ambagan sign-in link",
    text: `Tap the link below to sign in to ambagan. It works once and expires in 24 hours.\n\n${url}\n\n${footnote}`,
    html: shell(
      "Sign in to ambagan",
      ["Tap the button to sign in. The link works once and expires in 24 hours."],
      { label: "Sign in", url },
      footnote,
    ),
  };
}

export function invitationEmail({ name, url }: { name: string | null; url: string }): MailContent {
  const greeting = `Hi ${name?.trim() || "there"}`;
  const footnote = "This invitation link expires in 7 days.";
  return {
    subject: "You're invited to ambagan",
    text: `${greeting},\n\nYou've been invited to ambagan, where we track and settle our shared subscription. Open the link below to get started.\n\n${url}\n\n${footnote}`,
    html: shell(
      "You're invited",
      [`${escapeHtml(greeting)},`, "You've been invited to ambagan, where we track and settle our shared subscription."],
      { label: "Accept invitation", url },
      footnote,
    ),
  };
}
