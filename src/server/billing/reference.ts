import { randomInt } from "node:crypto";

/** No 0/O/1/I/L: references get read aloud and retyped from screenshots. 31^6 is about 887 million. */
export const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const SUFFIX_LENGTH = 6;

export function referenceSuffix(): string {
  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i++) suffix += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return suffix;
}

/** "SPOT-202610-K4M2Q8". Uniqueness is enforced by the database; callers retry on a collision. */
export function generateReference(prefix: string, period: string, suffix: () => string = referenceSuffix): string {
  return `${prefix}-${period.replace("-", "")}-${suffix()}`;
}
