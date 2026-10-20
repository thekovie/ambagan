import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

// Auth.js session cookie names (plain over http, __Secure- prefixed over https).
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];
const SIGNED_IN_PREFIXES = ["/dashboard", "/statements", "/payments", "/pay", "/settings", "/admin"];

function nonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

/**
 * Two jobs on every page request. (1) Content-Security-Policy with a fresh nonce: Next reads it from the
 * request header and stamps its own scripts, so injected scripts without it don't run. (2) A UX shortcut only:
 * visitors without a session cookie go straight to sign-in. It cannot tell a valid session from a stale
 * cookie, so every layout, page and server action still verifies the session and role on the server.
 */
export function proxy(request: NextRequest) {
  // API routes return no pages (and the QR route sets its own sandbox CSP). Drop any client-supplied nonce or
  // CSP header so they can never reach a layout that might render (e.g. a 404), then pass through untouched.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const headers = new Headers(request.headers);
    headers.delete("x-nonce");
    headers.delete("content-security-policy");
    return NextResponse.next({ request: { headers } });
  }

  const scriptNonce = nonce();
  const csp = buildCsp({
    nonce: scriptNonce,
    isDev: process.env.NODE_ENV === "development",
    isHttps: (process.env.APP_URL ?? "").startsWith("https://"),
  });
  const needsSession = SIGNED_IN_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix));

  if (needsSession && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    // Built from APP_URL, not the request: behind a proxy the request carries the proxy's Host and scheme.
    const redirect = NextResponse.redirect(new URL("/login", process.env.APP_URL ?? request.url));
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", csp);
  headers.set("x-nonce", scriptNonce); // read by the root layout for its inline theme script
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Everything except static files and the OCR assets (which never render a layout).
  matcher: ["/((?!_next/static|_next/image|ocr/|favicon.ico).*)"],
};
