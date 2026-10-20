/** Characters that have no business in a display name: control characters, and ones that hide or reorder text. */
const INVISIBLE = /[\p{Cc}​‌‎‏‪-‮⁠-⁤⁦-⁩؜﻿]/gu;

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
