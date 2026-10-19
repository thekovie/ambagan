import { describe, expect, it } from "vitest";
import { invitationEmail, loginEmail } from "@/server/email/auth-templates";

describe("auth email templates", () => {
  it("login email carries the sign-in link, expiry note and a plain-text twin", () => {
    const mail = loginEmail({ url: "https://app.example.com/api/auth/callback/nodemailer?token=abc&x=1" });
    expect(mail.subject).toBe("Your ambagan sign-in link");
    expect(mail.text).toContain("https://app.example.com/api/auth/callback/nodemailer?token=abc&x=1");
    expect(mail.html).toContain("token=abc&amp;x=1");
    expect(mail.text).toMatch(/24 hours/);
  });

  it("invitation email greets the member and links to the invite page", () => {
    const mail = invitationEmail({ name: "Ana", url: "https://app.example.com/invite/tok" });
    expect(mail.subject).toBe("You're invited to ambagan");
    expect(mail.text).toContain("Hi Ana");
    expect(mail.text).toContain("https://app.example.com/invite/tok");
    expect(mail.html).toContain('href="https://app.example.com/invite/tok"');
  });

  it("escapes HTML in names so a hostile display name cannot inject markup", () => {
    const mail = invitationEmail({ name: '<img src=x onerror="alert(1)">', url: "https://app.example.com/invite/tok" });
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
  });

  it("falls back to a generic greeting without a name", () => {
    expect(invitationEmail({ name: null, url: "https://x.test/i/1" }).text).toContain("Hi there");
  });
});
