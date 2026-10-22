/** Characters that have no business in a display name: control characters, and ones that hide or reorder text. */
const INVISIBLE = /[\p{Cc}​‌‎‏‪-‮⁠-⁤⁦-⁩؜﻿]/gu;

// Everything in INVISIBLE except line breaks (tabs become spaces first), for text that may span lines.
const INVISIBLE_KEEP_LINES = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F​‌‎‏‪-‮⁠-⁤⁦-⁩؜﻿]/g;

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
