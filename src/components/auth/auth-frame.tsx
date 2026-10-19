import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";

/** Cobalt foil panel with a crimped edge beside (or above) the form column. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(28rem,36rem)]">
      <section className="crimp-panel flex flex-col justify-between gap-8 bg-foil-cobalt px-6 pb-12 pt-8 text-[var(--on-foil-cobalt)] lg:px-14 lg:py-14">
        <Wordmark />
        <p className="font-display text-[clamp(3.25rem,13vw,7rem)]">
          split it,
          <br />
          settle it.
        </p>
      </section>
      <section className="flex items-center px-6 py-10 lg:px-14">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
