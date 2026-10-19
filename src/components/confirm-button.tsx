"use client";

import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ConfirmButtonProps extends Omit<ComponentProps<typeof Button>, "type" | "onClick" | "onBlur"> {
  /** Shown while armed, e.g. "Sure? Deactivate". Accepts nodes so callers can add a hidden per-item name. */
  confirmLabel: ReactNode;
}

const DISARM_AFTER_MS = 6000;

/**
 * Two-step submit for consequential actions: the first press arms it ("Sure?"), the second submits.
 * It disarms after a few seconds or when focus leaves. Replaces a modal where no protected focus is needed.
 */
export function ConfirmButton({ children, confirmLabel, ...props }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), DISARM_AFTER_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <>
      <Button
        {...props}
        type="submit"
        onBlur={() => setArmed(false)}
        onClick={(event) => {
          // First press only arms the button; cancelling the click stops the form from submitting.
          if (armed) return;
          event.preventDefault();
          setArmed(true);
        }}
      >
        {armed ? confirmLabel : children}
      </Button>
      <span role="status" className="sr-only">
        {armed ? "Press again to confirm" : ""}
      </span>
    </>
  );
}
