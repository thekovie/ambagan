/**
 * The one look every ambagan email shares: the sticker-book theme (pastel stickers, ink outlines, candy button) in
 * email-safe HTML. Clients ignore external CSS and most modern features, so this is table layout, inline styles and
 * hex colours; the fancier touches (rounded corners, the offset shadow) simply fall back to square in the few clients
 * that ignore them. Every value is escaped here, so callers pass plain text.
 */

/** The coin is attached to the message under this Content-ID (see transport.ts) and shown with `src="cid:..."`. */
export const LOGO_CID = "ambagan-logo";

const INK = "#3a1d36";
const PAPER = "#fff4f2";
const CANDY = "#d1005a";
const MUTED = "#5f4259";
const FONT = "'Nunito','Trebuchet MS','Avenir Next','Arial Rounded MT Bold',Arial,Helvetica,sans-serif";

/** The same pastels as the app's stickers. */
export const TONES = {
  sky: "#a9d0f5",
  butter: "#fbe89b",
  mint: "#b7e8cf",
  rose: "#f6b4bb",
  peach: "#f7cba7",
  lilac: "#d9c7f2",
} as const;
export type Tone = keyof typeof TONES;

const FACT_COLORS = [TONES.butter, TONES.mint, TONES.sky, TONES.rose, TONES.lilac, TONES.peach];
const DOT_COLORS = [TONES.rose, TONES.butter, TONES.mint, TONES.sky];

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c]);

export interface EmailParts {
  /** The grey line some inboxes show beside the subject. */
  preview?: string;
  /** Colours the band behind the heading. */
  tone: Tone;
  /** The little sticker above the heading, e.g. "🧾 New statement". */
  badge: string;
  heading: string;
  /** "Hi Ana,": shown bold above the paragraphs. */
  greeting?: string;
  paragraphs: string[];
  /** Label and value rows, each drawn as a pastel sticker. */
  facts?: [label: string, value: string][];
  cta?: { label: string; url: string };
  /** The small print under the card. */
  footnote: string;
}

const dots = () =>
  DOT_COLORS.map((color) => `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};border:2px solid ${INK};margin:0 3px"></span>`).join("");

function factRows(facts: [string, string][]): string {
  const rows = facts
    .map(
      ([label, value], index) =>
        `<tr><td style="padding:0 0 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FACT_COLORS[index % FACT_COLORS.length]};border:2px solid ${INK};border-radius:12px"><tr>` +
        `<td style="padding:9px 14px;font-size:13px;font-weight:700;color:${MUTED}">${esc(label)}</td>` +
        `<td align="right" style="padding:9px 14px;font-size:15px;font-weight:800;color:${INK}">${esc(value)}</td></tr></table></td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 10px">${rows}</table>`;
}

export function renderEmail(parts: EmailParts): { html: string; text: string } {
  const paragraphs = parts.paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${INK}">${esc(p)}</p>`).join("");
  const greeting = parts.greeting ? `<p style="margin:0 0 14px;font-size:18px;font-weight:800;color:${INK}">${esc(parts.greeting)}</p>` : "";
  const cta = parts.cta
    ? `<p style="margin:22px 0 18px"><a href="${esc(parts.cta.url)}" style="display:inline-block;background:${CANDY};color:#ffffff;font-size:16px;font-weight:800;text-decoration:none;padding:14px 28px;border-radius:999px;border:2px solid ${INK};box-shadow:3px 3px 0 ${INK}">${esc(parts.cta.label)}</a></p>` +
      `<p style="margin:0 0 4px;font-size:13px;line-height:1.5;color:${MUTED}">Button not working? Paste this link into your browser:<br><a href="${esc(parts.cta.url)}" style="color:${MUTED};word-break:break-all">${esc(parts.cta.url)}</a></p>`
    : "";
  const preview = parts.preview
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${esc(parts.preview)}</div>`
    : "";

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(parts.heading)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};font-family:${FONT};color:${INK}">${preview}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:28px 14px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 14px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="middle"><img src="cid:${LOGO_CID}" width="44" height="44" alt="" style="display:block;border:0;width:44px;height:44px"></td>
<td valign="middle" style="padding-left:10px;font-size:28px;font-weight:900;letter-spacing:-0.5px;color:${INK}">ambagan</td>
</tr></table></td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:2px solid ${INK};border-radius:22px;box-shadow:5px 5px 0 ${INK}">
<tr><td style="background:${TONES[parts.tone]};border-bottom:2px solid ${INK};border-radius:20px 20px 0 0;padding:22px 28px 20px">
<span style="display:inline-block;background:#ffffff;border:2px solid ${INK};border-radius:999px;padding:4px 12px;font-size:12px;font-weight:800;letter-spacing:0.4px;text-transform:uppercase;color:${INK}">${esc(parts.badge)}</span>
<h1 style="margin:14px 0 0;font-size:30px;line-height:1.1;font-weight:900;letter-spacing:-0.5px;color:${INK}">${esc(parts.heading)}</h1></td></tr>
<tr><td style="padding:24px 28px 22px">${greeting}${paragraphs}${parts.facts?.length ? factRows(parts.facts) : ""}${cta}</td></tr>
</table></td></tr>
<tr><td align="center" style="padding:22px 12px 0"><div>${dots()}</div>
<p style="margin:10px 0 4px;font-size:14px;font-weight:800;color:${INK}">Split it, settle it.</p>
<p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED}">${esc(parts.footnote)}</p></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    parts.heading,
    parts.greeting,
    ...parts.paragraphs,
    parts.facts?.length ? parts.facts.map(([label, value]) => `${label}: ${value}`).join("\n") : undefined,
    parts.cta ? `${parts.cta.label}: ${parts.cta.url}` : undefined,
    parts.footnote,
    "ambagan: Split it, settle it.",
  ]
    .filter((block): block is string => Boolean(block))
    .join("\n\n");

  return { html, text };
}
