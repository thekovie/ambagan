"use client";

import { ArrowRight, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const KEY = "ambagan-welcome-dismissed";

// Remembered in this browser only (nothing goes to the server). The in-memory flag covers a browser that blocks storage.
let dismissedInMemory = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isDismissed(): boolean {
  if (dismissedInMemory) return true;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss() {
  dismissedInMemory = true;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* storage blocked: the in-memory flag still hides it for this visit */
  }
  listeners.forEach((listener) => listener());
}

/**
 * A one-line invitation to the guide at the top of Home and Overview, until the person dismisses it. On the server and
 * during hydration it reads as already dismissed, so it never flashes in and out for someone who closed it.
 */
export function WelcomeCard({ className }: { className?: string }) {
  const hidden = useSyncExternalStore(subscribe, isDismissed, () => true);
  if (hidden) return null;

  return (
    <section aria-label="Welcome" className={cn("flex max-w-2xl items-start gap-3 rounded-2xl border border-border bg-st-butter p-4 text-st-ink", className)}>
      <Sparkles className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="font-semibold">New here? Take a one-minute look at how ambagan works.</p>
        <div>
          <Link href="/guide" className={buttonVariants({ variant: "default", size: "sm" })}>
            How it works <ArrowRight data-icon="inline-end" />
          </Link>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome"
        className="-mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-full outline-none hover:bg-black/5 focus-visible:outline-3 focus-visible:outline-ring"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
    </section>
  );
}
