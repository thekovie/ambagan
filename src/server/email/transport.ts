import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getEnv } from "@/env";
import { LOGO_CID } from "./email-frame";
import { LOGO_PNG_BASE64 } from "./logo-png";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const SMTP_TIMEOUT_MS = 15_000;

let transporter: Transporter | undefined;

function getTransporter(smtp: NonNullable<ReturnType<typeof getEnv>["smtp"]>): Transporter {
  return (transporter ??= nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    // Port 587 style servers upgrade with STARTTLS; refuse to fall back to plaintext.
    requireTLS: !smtp.secure,
    // A black-holed server must fail fast: the defaults wait minutes and would stall the whole send run.
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
  }));
}

/**
 * Sends one email over SMTP. Throws on failure so callers decide how to retry.
 * Without SMTP settings (development only) the message is printed instead.
 */
export async function sendMail(mail: OutgoingMail): Promise<void> {
  const { smtp } = getEnv();
  if (!smtp) {
    // Development fallback that prints sign-in links; it must never run in production.
    if (process.env.NODE_ENV === "production") throw new Error("SMTP is not configured");
    console.info(`\n[mail:dev] to=${mail.to}\n[mail:dev] subject=${mail.subject}\n${mail.text}\n`);
    return;
  }
  await getTransporter(smtp).sendMail({
    from: { name: smtp.fromName, address: smtp.fromEmail },
    replyTo: smtp.replyTo,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    // The coin travels inside the message, so there is no remote image to block (or to reveal who opened it).
    attachments: mail.html.includes(`cid:${LOGO_CID}`)
      ? [{ filename: "ambagan.png", content: Buffer.from(LOGO_PNG_BASE64, "base64"), contentType: "image/png", cid: LOGO_CID, contentDisposition: "inline" }]
      : [],
  });
}
