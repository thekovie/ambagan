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
    <div className="flex max-w-xl flex-col gap-12">
      <header>
        <h1 className="font-display text-5xl md:text-6xl">Settings</h1>
      </header>

      <section aria-labelledby="details" className="flex flex-col gap-5">
        <h2 id="details" className="font-display text-3xl">
          Your details
        </h2>
        <ProfileForm name={user.name ?? ""} email={email} />
      </section>

      <section aria-labelledby="emails" className="flex flex-col gap-3">
        <h2 id="emails" className="font-display text-3xl">
          Emails
        </h2>
        <p className="text-muted-foreground">
          We write to <strong className="text-foreground">{email}</strong> when a statement is issued, the day before it
          is due, on the due date, and if it becomes overdue. You&apos;ll also hear from us when a payment you reported is
          approved or needs another look.
        </p>
      </section>

      <section aria-labelledby="session" className="flex flex-col gap-3">
        <h2 id="session" className="font-display text-3xl">
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
