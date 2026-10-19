import "server-only";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { getEnv } from "@/env";
import { getDb } from "@/server/db/client";
import { accounts, sessions, users, verificationTokens } from "@/server/db/schema";
import { loginEmail } from "@/server/email/auth-templates";
import { sendMail } from "@/server/email/transport";
import { checkSignIn } from "./access";

const DAY_S = 24 * 60 * 60;

function buildConfig(): NextAuthConfig {
  const env = getEnv();
  const db = getDb();
  // Emailed links must point at our own origin, never at whatever Host header the request carried.
  process.env.AUTH_URL = env.APP_URL;

  return {
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    // We sit behind a reverse proxy. Safe because AUTH_URL (set above) pins the origin used in links.
    trustHost: true,
    // Database sessions so deactivating a member (deleting their rows) logs them out immediately.
    session: { strategy: "database", maxAge: 30 * DAY_S, updateAge: DAY_S },
    pages: { signIn: "/login", verifyRequest: "/login/sent", error: "/login/error" },
    providers: [
      Nodemailer({
        // Mail goes out through our own transport below; this value is never used for delivery.
        server: { jsonTransport: true },
        from: env.smtp?.fromEmail ?? "noreply@localhost",
        maxAge: DAY_S,
        async sendVerificationRequest({ identifier, url }) {
          // No account enumeration: unknown or deactivated addresses get the same "check your email" page, minus the email.
          if (!checkSignIn(db, identifier, env.ADMIN_EMAIL).ok) return;
          // Not awaited: SMTP latency (or failure) must not reveal that the address exists.
          // Failures are logged for the admin; the notification queue adds retries later.
          void sendMail({ to: identifier, ...loginEmail({ url }) }).catch((error: unknown) => {
            console.error("Sign-in email failed to send", error instanceof Error ? error.message : error);
          });
        },
      }),
    ],
    callbacks: {
      signIn({ user, email }) {
        // Request step is gated in sendVerificationRequest; the callback step must re-check (account may be deactivated since).
        if (email?.verificationRequest) return true;
        return user.email ? checkSignIn(db, user.email, env.ADMIN_EMAIL).ok : false;
      },
      session({ session, user }) {
        return { ...session, user: { ...session.user, id: user.id, role: user.role, isActive: user.isActive } };
      },
    },
  };
}

// Lazy config: env and DB are touched per request, never at build time.
export const { handlers, auth, signIn, signOut } = NextAuth(() => buildConfig());
