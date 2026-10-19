"use client";

import { ArrowRight } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestLoginLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestLoginLink, {});

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@example.com"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "email-error" : undefined}
        />
        {state.error ? (
          <p id="email-error" role="alert" className="text-sm font-semibold text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
      <Button type="submit" variant="foil" size="lg" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Email me a link"}
        {pending ? null : <ArrowRight data-icon="inline-end" />}
      </Button>
    </form>
  );
}
