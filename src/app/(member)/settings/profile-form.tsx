"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction, type ProfileState } from "./actions";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfileAction, {});

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          name="name"
          required
          maxLength={80}
          autoComplete="name"
          defaultValue={state.values?.name ?? name}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "profile-error" : undefined}
        />
        {state.error ? (
          <p id="profile-error" role="alert" className="text-sm font-semibold text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-email">Email</Label>
        <Input id="profile-email" value={email} readOnly aria-describedby="profile-email-hint" />
        <p id="profile-email-hint" className="text-sm text-muted-foreground">
          Your sign-in and reminder address. Ask the admin if it needs to change.
        </p>
      </div>
      <p role="status" aria-live="polite" className="text-sm font-semibold empty:hidden">
        {state.saved ? "Saved." : null}
      </p>
      <div>
        <Button type="submit" disabled={pending}>
          <Save data-icon="inline-start" />
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
