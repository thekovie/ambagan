import fs from "node:fs";
import path from "node:path";

export const MAIL_DIR = path.join(process.cwd(), "e2e", ".tmp", "mail");

export interface CapturedMail {
  to: string;
  subject: string;
  /** The plain-text part, decoded. */
  text: string;
}

function decodeQuotedPrintable(input: string): string {
  const joined = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(joined[i], "utf8"));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

/** RFC 2047 "encoded words" in headers, e.g. =?UTF-8?Q?Ana_reported_a_payment_of_=E2=82=B150?= */
function decodeHeader(value: string): string {
  return value
    .replace(/\r?\n[ \t]+/g, " ")
    // Whitespace between two adjacent encoded words is not part of the text (RFC 2047, section 6.2).
    .replace(/(\?=)\s+(=\?UTF-8\?)/gi, "$1$2")
    .replace(/=\?UTF-8\?([QB])\?([^?]*)\?=/gi, (_, kind: string, body: string) =>
      kind.toUpperCase() === "B" ? Buffer.from(body, "base64").toString("utf8") : decodeQuotedPrintable(body.replace(/_/g, " ")),
    );
}

function parse(raw: string): CapturedMail {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/);
  const header = (name: string) => decodeHeader(new RegExp(`^${name}:\\s*([^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*)`, "im").exec(head)?.[1] ?? "");
  const body = rest.join("\n\n");
  const plain = /Content-Type: text\/plain[^\r\n]*\r?\n(?:[^\r\n]+\r?\n)*\r?\n([\s\S]*?)(?:\r?\n--[^\r\n]+|$)/i.exec(body)?.[1] ?? body;
  return { to: header("To"), subject: header("Subject"), text: decodeQuotedPrintable(plain) };
}

export function readMails(): CapturedMail[] {
  if (!fs.existsSync(MAIL_DIR)) return [];
  return fs
    .readdirSync(MAIL_DIR)
    .filter((f) => f.endsWith(".eml"))
    .sort()
    .map((f) => parse(fs.readFileSync(path.join(MAIL_DIR, f), "utf8")));
}

/** Waits for a message to the address whose subject matches, and returns the newest such message. */
export async function waitForMail(to: string, subject: RegExp, timeoutMs = 20_000): Promise<CapturedMail> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = readMails().filter((m) => m.to.includes(to) && subject.test(m.subject)).at(-1);
    if (found) return found;
    if (Date.now() > deadline) {
      const seen = readMails().map((m) => `${m.to} | ${m.subject}`).join("\n  ");
      throw new Error(`No email to ${to} matching ${subject} within ${timeoutMs} ms. Received:\n  ${seen || "(nothing)"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

/** The first link in an email's text that starts with `prefix`. */
export function linkIn(mail: CapturedMail, prefix: string): string {
  const match = mail.text.match(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\S*`));
  if (!match) throw new Error(`No link starting with ${prefix} in:\n${mail.text}`);
  return match[0];
}
