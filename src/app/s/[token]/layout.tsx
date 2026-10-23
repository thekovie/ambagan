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
      <main id="main" className="mx-auto w-full max-w-xl px-4 pb-6 pt-3 sm:px-6">
        {children}
      </main>
      <footer className="mx-auto w-full max-w-xl px-4 pb-16 text-sm text-muted-foreground sm:px-6">
        {/* A plain link with noreferrer: this page's address is a credential, so it must not reach our own logs as a Referer. */}
        <a href="/privacy" rel="noreferrer" className="font-semibold underline underline-offset-4">
          Privacy policy
        </a>
      </footer>
    </div>
  );
}
