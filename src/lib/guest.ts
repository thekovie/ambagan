/**
 * A guest is a friend without an account (they pay through a private link). Every user row needs a unique email,
 * so a guest with no real address gets a placeholder one on a domain that can never receive mail (RFC 6761).
 */
export const GUEST_EMAIL_DOMAIN = "guests.invalid";

export function placeholderEmail(userId: string): string {
  return `guest-${userId}@${GUEST_EMAIL_DOMAIN}`;
}

/** What to show where an email would go: a real address as is, and "No email" for a guest's placeholder. */
export function displayEmail(email: string): string {
  return isPlaceholderEmail(email) ? "No email" : email;
}

/** True for placeholder addresses: there is nobody to email, so notifications are skipped. */
export function isPlaceholderEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);
}
