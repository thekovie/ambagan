import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <div className="flex flex-col items-start gap-6">
      <div className="grid size-14 place-items-center rounded-full bg-st-mint text-st-ink">
        <MailCheck className="size-7" aria-hidden="true" />
      </div>
      <div>
        <h1 className="font-display text-5xl">Check your email</h1>
        <p className="mt-3 text-muted-foreground">
          If that address is on the list, a sign-in link is on its way. It works once and lasts 24 hours. Nothing
          there? Check spam, or ask the admin.
        </p>
      </div>
      <Button variant="outline" render={<Link href="/login" />}>
        Use a different email
      </Button>
    </div>
  );
}
