"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { NAV, type ShellVariant } from "@/components/shell/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

interface AppShellProps {
  variant: ShellVariant;
  /** Account area (name, sign out) rendered at the foot of the desktop rail. */
  footer?: ReactNode;
  children: ReactNode;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop: left rail. Mobile: slim top bar + thumb-reach bottom tabs (member) or scrolling tabs (admin). */
export function AppShell({ variant, footer, children }: AppShellProps) {
  const pathname = usePathname();
  const items = NAV[variant];

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15.5rem_minmax(0,1fr)] print:block">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-foreground px-4 py-2 text-background focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-sidebar-border bg-sidebar p-5 md:flex print:hidden">
        <Wordmark className="px-2 pt-1" />
        <nav aria-label={variant === "admin" ? "Admin" : "Main"} className="flex flex-col gap-1">
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-full px-4 text-sm font-bold transition-colors duration-200",
                  active
                    ? "bg-foreground text-background"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                <Icon className="size-[1.1rem]" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">{footer}</div>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background px-4 md:hidden print:hidden">
          <Wordmark />
          <ThemeToggle />
        </header>

        {variant === "admin" ? (
          <nav
            aria-label="Admin"
            className="flex gap-2 overflow-x-auto border-b border-border px-4 py-2 md:hidden print:hidden [scrollbar-width:none]"
          >
            {items.map(({ href, label }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 shrink-0 items-center rounded-full px-4 text-sm font-bold",
                    active ? "bg-foreground text-background" : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        ) : null}

        <main
          id="main"
          className={cn(
            "mx-auto w-full max-w-5xl flex-1 overflow-x-clip px-4 pt-6 md:px-10 md:py-10",
            variant === "member" ? "pb-28 md:pb-10" : "pb-10",
          )}
        >
          {children}
        </main>

        {variant === "member" ? (
          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
          >
            <ul className="grid grid-cols-4">
              {items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-bold"
                    >
                      <span
                        className={cn(
                          "grid h-7 w-12 place-items-center rounded-full transition-colors duration-200",
                          active ? "bg-foreground text-background" : "text-muted-foreground",
                        )}
                      >
                        <Icon className="size-[1.15rem]" aria-hidden="true" />
                      </span>
                      <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
