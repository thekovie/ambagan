import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";

/** Sign-in pages: the tagline above one soft card, on a ground with a few pastel shapes. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="absolute -left-16 top-10 size-56 rounded-full bg-st-peach opacity-60" />
        <span className="absolute -right-12 top-1/3 size-44 rotate-12 rounded-[2.5rem] bg-st-sky opacity-60" />
        <span className="absolute -bottom-14 left-1/4 size-52 rounded-full bg-st-mint opacity-60" />
      </div>
      <div className="relative w-full max-w-md">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <Wordmark />
          <p className="font-display text-3xl">split it, settle it.</p>
        </div>
        <div className="sheet p-6 sm:p-8">{children}</div>
      </div>
    </main>
  );
}
