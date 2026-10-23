import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { signOutAction } from "@/app/actions/sign-out";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/session";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const email = user.email ?? "";

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header>
        <h1 className="font-display text-display">Settings</h1>
      </header>

      <section aria-labelledby="details" className="sheet flex flex-col gap-5 p-5 sm:p-6">
        <h2 id="details" className="font-display text-title">
          Your details
        </h2>
        <ProfileForm name={user.name ?? ""} email={email} />
      </section>

      <section aria-labelledby="emails" className="sheet flex flex-col gap-3 p-5 sm:p-6">
        <h2 id="emails" className="font-display text-title">
          Emails
        </h2>
        <p className="text-muted-foreground">
          We write to <strong className="text-foreground">{email}</strong> when a statement is issued, the day before it
          is due, on the due date, and if it becomes overdue. You&apos;ll also hear from us when a payment you reported is
          approved or needs another look.
        </p>
      </section>

      <section aria-labelledby="privacy" className="sheet flex flex-col gap-3 p-5 sm:p-6">
        <h2 id="privacy" className="font-display text-title">
          Your information
        </h2>
        <p className="text-muted-foreground">
          We keep your name, email, bills and the payments you report, only to run the group&apos;s shared bills.{" "}
          <a href="/privacy" className="font-semibold text-foreground underline underline-offset-4">
            Read the privacy policy
          </a>{" "}
          to see who can see it, how long it is kept, and how to ask for a copy, a correction or removal.
        </p>
      </section>

      <section aria-labelledby="session" className="flex flex-col gap-3 px-1">
        <h2 id="session" className="font-display text-title">
          Sign out
        </h2>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            <LogOut data-icon="inline-start" /> Sign out of this device
          </Button>
        </form>
      </section>
    </div>
  );
}
