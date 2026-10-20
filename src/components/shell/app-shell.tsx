"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { AvatarMenu } from "@/components/shell/avatar-menu";
import { Dock } from "@/components/shell/dock";
import { HOME, type ShellVariant } from "@/components/shell/nav";
import { cn } from "@/lib/utils";

interface AppShellProps {
  variant: ShellVariant;
  user: { name: string | null; email: string };
  /** Payments waiting for the admin (admin shell only). */
  pendingCount?: number;
  children: ReactNode;
}

/**
 * No sidebar anywhere: a slim top bar (wordmark, account bubble), one centred column, and a floating dock at the
 * bottom of every screen size for navigation.
 */
export function AppShell({ variant, user, pendingCount, children }: AppShellProps) {
  return (
    <div className="min-h-dvh print:block">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-20 bg-background print:hidden">
        <div className={cn("mx-auto flex h-16 items-center justify-between px-4 sm:px-6", variant === "admin" ? "max-w-4xl" : "max-w-3xl")}>
          <Link href={HOME[variant]} aria-label="ambagan home" className="rounded-full">
            <Wordmark />
          </Link>
          <AvatarMenu name={user.name} email={user.email} />
        </div>
      </header>

      <main
        id="main"
        className={cn(
          "mx-auto w-full overflow-x-clip px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 print:max-w-none print:pb-0",
          variant === "admin" ? "max-w-4xl" : "max-w-3xl",
        )}
      >
        {children}
      </main>

      <Dock variant={variant} pendingCount={pendingCount} />
    </div>
  );
}
