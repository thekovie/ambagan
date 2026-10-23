"use client";

import { Menu } from "@base-ui/react/menu";
import { CircleHelp, LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
import Link from "next/link";
import { signOutAction } from "@/app/actions/sign-out";
import { useDarkMode } from "@/components/theme-toggle";
import { avatarClass, initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

interface AvatarMenuProps {
  name: string | null;
  email: string;
}

const ITEM =
  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-semibold outline-none data-[highlighted]:bg-secondary data-[highlighted]:outline-3 data-[highlighted]:-outline-offset-2 data-[highlighted]:outline-ring";

/** Account bubble in the top bar: who is signed in, the theme, and sign out (which no screen offered on phones before). */
export function AvatarMenu({ name, email }: AvatarMenuProps) {
  const { dark, toggle } = useDarkMode();

  return (
    <>
      {/* Sign out is a normal form post; the menu item below submits it from inside the portal via the `form` attribute. */}
      <form id="ambagan-sign-out" action={signOutAction} hidden />
      <Menu.Root>
        <Menu.Trigger
          aria-label="Account menu"
          className={cn(
            "grid size-11 place-items-center rounded-full text-sm font-bold outline-none transition-transform active:scale-95",
            "ring-2 ring-[var(--sticker-edge)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
            avatarClass(name || email),
          )}
        >
          {initials(name, email)}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={10} collisionPadding={12} className="z-40">
            <Menu.Popup
              className={cn(
                "sheet w-64 p-2 outline-none",
                "origin-top-right transition-[opacity,scale] duration-200 ease-out-expo",
                "data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
              )}
            >
              <Menu.Group>
                <Menu.GroupLabel className="px-3 pb-2 pt-2">
                  <span className="block truncate text-sm font-bold">{name || email}</span>
                  {name ? <span className="block truncate text-sm font-normal text-muted-foreground">{email}</span> : null}
                </Menu.GroupLabel>
              <Menu.CheckboxItem checked={dark} onCheckedChange={toggle} closeOnClick={false} className={ITEM}>
                {dark ? <Moon className="size-4" aria-hidden="true" /> : <Sun className="size-4" aria-hidden="true" />}
                Dark theme
                <span aria-hidden="true" className="ml-auto text-muted-foreground">
                  {dark ? "On" : "Off"}
                </span>
              </Menu.CheckboxItem>
              <Menu.Item render={<Link href="/guide" />} className={ITEM}>
                <CircleHelp className="size-4" aria-hidden="true" />
                How it works
              </Menu.Item>
              <Menu.Item render={<a href="/privacy" />} className={ITEM}>
                <ShieldCheck className="size-4" aria-hidden="true" />
                Privacy policy
              </Menu.Item>
              <Menu.Item nativeButton render={<button type="submit" form="ambagan-sign-out" />} className={ITEM}>
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </Menu.Item>
              </Menu.Group>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </>
  );
}
