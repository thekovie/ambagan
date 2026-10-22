const MESSAGES: Record<string, string> = {
  Verification: "That sign-in link has expired or was already used. Request a new one and it'll work.",
  AccessDenied: "This account can't sign in right now. If you think that's a mistake, ask the admin.",
};
const FALLBACK = "Something went wrong while signing you in. Please try again.";

/** What to tell someone who landed on the sign-in error page. The code comes from the URL, so only our own codes count. */
export function loginErrorMessage(code: unknown): string {
  return typeof code === "string" && Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : FALLBACK;
}
