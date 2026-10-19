import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Couldn't sign in" };

const MESSAGES: Record<string, string> = {
  Verification: "That sign-in link has expired or was already used. Request a new one and it'll work.",
  AccessDenied: "This account can't sign in right now. If you think that's a mistake, ask the admin.",
};
const FALLBACK = "Something went wrong while signing you in. Please try again.";

export default async function LoginErrorPage({ searchParams }: PageProps<"/login/error">) {
  const { error } = await searchParams;
  const message = (typeof error === "string" && MESSAGES[error]) || FALLBACK;

  return (
    <div className="flex flex-col items-start gap-6">
      <div className="grid size-14 place-items-center rounded-full bg-foil-magenta text-on-foil-magenta">
        <TriangleAlert className="size-7" aria-hidden="true" />
      </div>
      <div>
        <h1 className="font-display text-5xl">Couldn&apos;t sign you in</h1>
        <p className="mt-3 text-muted-foreground">{message}</p>
      </div>
      <Button render={<Link href="/login" />}>Back to sign in</Button>
    </div>
  );
}
