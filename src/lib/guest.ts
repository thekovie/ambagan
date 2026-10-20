/**
 * A guest is a friend without an account (they pay through a private link). Every user row needs a unique email,
 * so a guest with no real address gets a placeholder one on a domain that can never receive mail (RFC 6761).
 */
export const GUEST_EMAIL_DOMAIN = "guests.invalid";

export function placeholderEmail(userId: string): string {
  return `guest-${userId}@${GUEST_EMAIL_DOMAIN}`;
}

/** True for placeholder addresses: there is nobody to email, so notifications are skipped. */
export function isPlaceholderEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);
}
