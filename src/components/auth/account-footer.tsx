import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/actions/sign-out";

export function AccountFooter({ name, email }: { name: string | null; email: string }) {
  return (
    <div className="flex min-w-0 flex-col items-start">
      <p className="w-full truncate text-sm font-bold">{name || email}</p>
      <form action={signOutAction}>
        <Button type="submit" variant="link" size="xs" className="h-auto px-0 text-muted-foreground">
          Sign out
        </Button>
      </form>
    </div>
  );
}
