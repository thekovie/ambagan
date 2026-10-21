import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";

// A private link is for one person: keep it out of search engines and never leak it in a Referer header.
export const metadata: Metadata = {
  title: "Your ambag",
  // Generic on purpose: chat apps store link previews, so no name, amount or bill title goes in them.
  description: "Your share of a bill on ambagan, and how to pay it.",
  openGraph: { title: "Your ambag · ambagan", description: "Your share of a bill on ambagan, and how to pay it." },
  twitter: { title: "Your ambag · ambagan", description: "Your share of a bill on ambagan, and how to pay it." },
  robots: { index: false, follow: false, nocache: true },
  referrer: "same-origin",
};

/** The shell for private-link pages: just the wordmark and one centred column. No sign-in, no navigation. */
export default function ShareLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-xl items-center px-4 sm:px-6">
        <Wordmark />
      </header>
      <main id="main" className="mx-auto w-full max-w-xl px-4 pb-16 pt-3 sm:px-6">
        {children}
      </main>
    </div>
  );
}
