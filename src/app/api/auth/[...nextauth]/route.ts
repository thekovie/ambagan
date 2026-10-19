import { handlers } from "@/server/auth/config";

// GET serves the magic-link callback, csrf and session endpoints.
export const { GET } = handlers;

// Sign-in and sign-out run through server actions (rate limited, validated). Exposing Auth.js's
// own POST endpoints would let a script skip those limits with a freshly fetched CSRF token.
export function POST() {
  return new Response("Not found", { status: 404 });
}
