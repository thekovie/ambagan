/**
 * Characters that have no business in a name or a line of text: control characters, line and paragraph separators,
 * invisible formatting characters (zero-width spaces, right-to-left overrides, soft hyphens, tag characters) and the
 * few "blank-looking" letters. The zero-width joiner is kept, because emoji sequences (a family, a flag) need it.
 */
const INVISIBLE = /(?!\u200D)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u3164\u115F\u1160\u2800]/gu;

// The same, but line breaks survive (tabs become spaces first), for text that may span lines.
const INVISIBLE_KEEP_LINES = /(?![\n\u200D])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u3164\u115F\u1160\u2800]/gu;

/**
 * Free text from an admin or a member (a bill title, a note, a reason) that ends up in emails sent from our address.
 * Keeps ordinary text and line breaks, but removes control, zero-width and right-to-left override characters, which
 * could make a subject line read differently from what it says. Use `cleanDisplayName` where one line is wanted.
 */
export function cleanFreeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(INVISIBLE_KEEP_LINES, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * A display name is one visible line. Members choose their own, and it appears in emails sent from our address
 * (an admin's "X reported a payment" subject, for instance), so line breaks, zero-width characters and
 * right-to-left overrides are removed. Ordinary letters, accents and emoji are untouched.
 */
export function cleanDisplayName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
}
