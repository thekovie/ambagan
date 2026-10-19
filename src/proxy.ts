import { NextResponse, type NextRequest } from "next/server";

// Auth.js session cookie names (plain over http, __Secure- prefixed over https).
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

/**
 * UX shortcut only: sends visitors without a session cookie straight to sign-in.
 * It cannot tell a valid session from a stale cookie, so every layout, page and
 * server action still verifies the session and role on the server.
 */
export function proxy(request: NextRequest) {
  if (SESSION_COOKIES.some((name) => request.cookies.has(name))) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/dashboard/:path*", "/statements/:path*", "/payments/:path*", "/settings/:path*", "/admin/:path*"],
};
