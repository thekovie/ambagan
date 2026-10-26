import { describe, expect, it } from "vitest";
import { invitationEmail, loginEmail } from "@/server/email/auth-templates";
import { LOGO_CID, renderEmail, type EmailParts } from "@/server/email/email-frame";
import { LOGO_PNG_BASE64 } from "@/server/email/logo-png";

describe("auth email templates", () => {
  it("login email carries the sign-in link, expiry note and a plain-text twin", () => {
    const mail = loginEmail({ url: "https://app.example.com/api/auth/callback/nodemailer?token=abc&x=1" });
    expect(mail.subject).toBe("Your ambagan sign-in link");
    expect(mail.text).toContain("https://app.example.com/api/auth/callback/nodemailer?token=abc&x=1");
    expect(mail.html).toContain("token=abc&amp;x=1");
    expect(mail.text).toMatch(/30 minutes/);
  });

  it("invitation email greets the member and links to the invite page", () => {
    const mail = invitationEmail({ name: "Ana", url: "https://app.example.com/invite/tok" });
    expect(mail.subject).toBe("You're invited to ambagan");
    expect(mail.text).toContain("Hi Ana");
    expect(mail.text).toContain("https://app.example.com/invite/tok");
    expect(mail.html).toContain('href="https://app.example.com/invite/tok"');
  });

  it("names the person who invited them, in the subject and the body", () => {
    const mail = invitationEmail({ name: "Ana", url: "https://app.example.com/invite/tok", invitedBy: "Kovie" });
    expect(mail.subject).toBe("Kovie invited you to ambagan");
    expect(mail.text).toContain("Kovie invited you to ambagan");
    expect(mail.text).toContain("https://app.example.com/invite/tok");
  });

  it("escapes HTML in names so a hostile display name cannot inject markup", () => {
    const mail = invitationEmail({ name: '<img src=x onerror="alert(1)">', url: "https://app.example.com/invite/tok" });
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img");
  });

  it("falls back to a generic greeting without a name", () => {
    expect(invitationEmail({ name: null, url: "https://x.test/i/1" }).text).toContain("Hi there");
  });
});

describe("email look", () => {
  const sample: EmailParts = { tone: "mint", badge: "✅ Paid", heading: "Thanks", paragraphs: ["All set."], footnote: "Small print." };

  it("shows the coin from an inline attachment, with no remote image", () => {
    const { html } = renderEmail(sample);
    expect(html).toContain(`src="cid:${LOGO_CID}"`);
    expect(html).not.toMatch(/src="https?:/);
  });

  it("embeds a real 192x192 PNG for that attachment", () => {
    const png = Buffer.from(LOGO_PNG_BASE64, "base64");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([192, 192]);
  });

  it("gives every message the sticker look, the badge and the tagline, in HTML and plain text", () => {
    const mail = loginEmail({ url: "https://app.example.com/x" });
    expect(mail.html).toContain("<!DOCTYPE html");
    expect(mail.html).toContain("🔑 Sign-in link");
    expect(mail.html).toContain("Split it, settle it.");
    expect(mail.text).toContain("Split it, settle it.");
    expect(mail.text).not.toContain("<");
  });

  it("escapes facts, badge and preview text as well", () => {
    const { html } = renderEmail({ ...sample, badge: "<b>x</b>", preview: "<i>y</i>", facts: [["<u>L</u>", "<s>V</s>"]] });
    for (const tag of ["<b>x", "<i>y", "<u>L", "<s>V"]) expect(html).not.toContain(tag);
    expect(html).toContain("&lt;s&gt;V&lt;/s&gt;");
  });
});
