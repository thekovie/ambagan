"use client";

import { Popover } from "@base-ui/react/popover";
import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV, type NavItem, type ShellVariant } from "@/components/shell/nav";
import { cn } from "@/lib/utils";

interface DockProps {
  variant: ShellVariant;
  /** Payments waiting for the admin; shown as a small count on the Verify item. */
  pendingCount?: number;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Pastel chips for the destinations in the More sheet, so each one is easy to spot at a glance.
const CHIP = ["bg-st-peach", "bg-st-mint", "bg-st-lilac", "bg-st-sky"];

function DockLink({ item, active, pendingCount }: { item: NavItem; active: boolean; pendingCount: number }) {
  const Icon = item.icon;
  const count = item.badge === "pending" ? pendingCount : 0;
  return (
    <Link
      href={item.href}
      className="dock-item"
      aria-current={active ? "page" : undefined}
      // The visible label is part of the name, with the count added for people who can't see the badge.
      aria-label={count > 0 ? `${item.label}, ${count} waiting` : undefined}
    >
      <Icon className="size-5" aria-hidden="true" />
      <span className="dock-label">
        <span>{item.label}</span>
      </span>
      {count > 0 ? (
        <span className="dock-badge" aria-hidden="true">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The only navigation: a small pill floating at the bottom of every screen, within thumb reach. The current item
 * grows its label. Admin pages beyond the first three live behind the "More" bubble.
 */
export function Dock({ variant, pendingCount = 0 }: DockProps) {
  const pathname = usePathname();
  const { primary, more } = NAV[variant];
  const [open, setOpen] = useState(false);

  // Close the More sheet when the page changes (state adjusted during render, not in an effect).
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setOpen(false);
  }

  const moreActive = more.some((item) => isActive(pathname, item.href));

  return (
    <nav aria-label={variant === "admin" ? "Admin" : "Main"} className="dock print:hidden">
      {primary.map((item) => (
        <DockLink key={item.href} item={item} active={isActive(pathname, item.href)} pendingCount={pendingCount} />
      ))}

      {more.length > 0 ? (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger className="dock-item" data-open={moreActive ? "" : undefined} aria-current={moreActive ? "true" : undefined}>
            <Ellipsis className="size-5" aria-hidden="true" />
            <span className="dock-label">
              <span>More</span>
            </span>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner side="top" align="end" sideOffset={14} collisionPadding={12} className="z-40">
              <Popover.Popup
                aria-label="More"
                className={cn(
                  "sheet w-[min(21rem,calc(100vw-1.5rem))] p-3 outline-none",
                  "origin-bottom-right transition-[opacity,scale] duration-200 ease-out-expo",
                  "data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
                )}
              >
                <nav aria-label="More admin pages" className="grid grid-cols-2 gap-2">
                  {more.map((item, index) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl p-3 text-sm font-semibold transition-colors hover:bg-secondary",
                          active && "bg-secondary",
                        )}
                      >
                        <span className={cn("grid size-11 place-items-center rounded-full text-st-ink", CHIP[index % CHIP.length])}>
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      ) : null}
    </nav>
  );
}
