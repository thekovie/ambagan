import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loginErrorMessage } from "@/lib/login-error";

export const metadata: Metadata = { title: "Couldn't sign in" };

export default async function LoginErrorPage({ searchParams }: PageProps<"/login/error">) {
  const { error } = await searchParams;
  const message = loginErrorMessage(error);

  return (
    <div className="flex flex-col items-start gap-6">
      <div className="grid size-14 place-items-center rounded-full bg-st-rose text-st-ink">
        <TriangleAlert className="size-7" aria-hidden="true" />
      </div>
      <div>
        <h1 className="font-display text-display">Couldn&apos;t sign you in</h1>
        <p className="mt-3 text-muted-foreground">{message}</p>
      </div>
      <Button render={<Link href="/login" />}>Back to sign in</Button>
    </div>
  );
}
