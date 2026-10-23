import { Button } from "@/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { findInvitation } from "@/server/auth/invitations";
import { getDb } from "@/server/db/client";
import { acceptInvite } from "./actions";

export const metadata: Metadata = {
  title: "You're invited",
  description: "You've been invited to ambagan, where friends split shared bills.",
  openGraph: { title: "You're invited · ambagan", description: "You've been invited to ambagan, where friends split shared bills." },
  twitter: { title: "You're invited · ambagan", description: "You've been invited to ambagan, where friends split shared bills." },
};

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const lookup = findInvitation(getDb(), token);

  if (lookup.status === "valid") {
    const firstName = lookup.user.name?.trim().split(/\s+/)[0];
    return (
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-display text-display">{firstName ? `Hi ${firstName}, you're in` : "You're invited"}</h1>
          <p className="mt-3 text-muted-foreground">
            This is where we track and settle our shared subscription. Tap below and we&apos;ll email a sign-in link to{" "}
            <strong className="text-foreground">{lookup.user.email}</strong>.
          </p>
        </div>
        <form action={acceptInvite.bind(null, token)} className="flex flex-col gap-3">
          <Button type="submit" variant="candy" size="lg" className="w-full">
            Accept and email me a link
          </Button>
          {/* Consent notice at the moment someone first gives us their details. noreferrer: this address is a credential. */}
          <p className="text-sm text-muted-foreground">
            By accepting, you agree to how your name, email and payments are handled, as described in the{" "}
            <a href="/privacy" rel="noreferrer" className="font-semibold text-foreground underline underline-offset-4">
              privacy policy
            </a>
            .
          </p>
        </form>
      </div>
    );
  }

  if (lookup.status === "used") {
    return (
      <div className="flex flex-col items-start gap-6">
        <div>
          <h1 className="font-display text-display">Already accepted</h1>
          <p className="mt-3 text-muted-foreground">This invitation was already used. Sign in with your email instead.</p>
        </div>
        <Button render={<Link href="/login" />}>Go to sign in</Button>
      </div>
    );
  }

  // invalid, expired and deactivated look identical so links can't be probed.
  return (
    <div className="flex flex-col items-start gap-6">
      <div>
        <h1 className="font-display text-display">Link not working</h1>
        <p className="mt-3 text-muted-foreground">
          This invitation has expired or isn&apos;t valid. Ask the admin to send you a fresh one.
        </p>
      </div>
    </div>
  );
}
