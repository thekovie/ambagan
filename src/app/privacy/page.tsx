import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { getEnv } from "@/env";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What ambagan keeps about you, why, who sees it, and your rights under the Data Privacy Act of 2012 (Republic Act No. 10173).",
};

const UPDATED = "24 October 2026";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-display text-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

const List = ({ children }: { children: ReactNode }) => <ul className="flex list-disc flex-col gap-2 pl-6 marker:text-muted-foreground">{children}</ul>;

/**
 * Plain-language privacy notice, written to the transparency and rights parts of the Data Privacy Act of 2012 (RA 10173).
 * Public: people read it before they accept an invitation, so it never needs a sign-in.
 */
export default function PrivacyPage() {
  const env = getEnv();
  const contact = env.PRIVACY_EMAIL;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-10 px-5 py-8 sm:px-6">
      <header className="flex flex-col gap-6">
        <Link href="/" aria-label="ambagan home" className="w-fit rounded-full">
          <Wordmark />
        </Link>
        <div>
          <h1 className="font-display text-display">Privacy policy</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            The short version: ambagan keeps what it needs to split and settle your group&apos;s shared bills, and nothing more.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED}</p>
        </div>
      </header>

      <Section id="who" title="Who is responsible">
        <p>
          ambagan is a small tool that one person, the group admin, runs for a group of friends. The admin decides what is collected and
          why, which makes them the &ldquo;personal information controller&rdquo; under the Data Privacy Act of 2012 (Republic Act No.
          10173). For any question or request about your information, write to{" "}
          <a href={`mailto:${contact}`} className="font-semibold underline underline-offset-4">
            {contact}
          </a>
          .
        </p>
      </Section>

      <Section id="collect" title="What we keep about you">
        <List>
          <li>
            <strong>Your name and email address</strong>, so we can invite you, sign you in and email you.
          </li>
          <li>
            <strong>Your bills:</strong> monthly statements, ambag (split bill) shares, amounts, due dates and any late fees.
          </li>
          <li>
            <strong>Payment reports you send:</strong> the reference number, amount, the app you paid from, the date and time, and a note if
            you add one. The admin uses these to check that the money arrived.
          </li>
          <li>
            <strong>Sign-in details:</strong> one-time sign-in links, and a session while you are signed in.
          </li>
          <li>
            <strong>A log</strong> of the emails we sent you (address, subject, when) and of changes made in the app (who did what, when).
          </li>
          <li>
            <strong>If you are a guest</strong> (no account): your name, an email only if the admin adds one, and the bills on your private link.
          </li>
        </List>
        <p>
          We do <strong>not</strong> keep your receipt screenshots. Scanning a receipt happens inside your browser, and only the fields you check
          and send reach the server.
        </p>
      </Section>

      <Section id="why" title="Why, and on what basis">
        <p>
          Only to run the group&apos;s shared bills: issue statements, take and check payment reports, and send reminders. We rely on your{" "}
          <strong>consent</strong>, given when you accept your invitation or use ambagan, and on what is needed to carry out the arrangement
          you joined. We do not sell or rent your information, show ads, build profiles of you or run analytics trackers.
        </p>
      </Section>

      <Section id="who-sees" title="Who can see it">
        <List>
          <li>
            <strong>The admin</strong> can see everything, because they run the group&apos;s accounts and verify payments.
          </li>
          <li>
            <strong>Other members cannot see yours.</strong> Each person sees only their own statements and payments. A guest sees only the
            page behind their own private link.
          </li>
          <li>
            <strong>Service providers</strong> who help it run: the email service the admin set up (it handles your address and the text of the
            emails we send you) and whoever hosts the server. They get nothing beyond that.
          </li>
          <li>We share it with no one else unless the law requires it.</li>
        </List>
      </Section>

      <Section id="safe" title="Where it lives and how it is protected">
        <p>
          Your information is stored on the server the admin runs, over encrypted connections. There are no passwords: you sign in with a
          link sent to your email, and private links are signed so they cannot be guessed. Only the admin can open the admin pages. The admin
          keeps daily backups. No system is perfectly secure; if a breach ever puts you at real risk, we will tell the people affected and the
          National Privacy Commission as the law requires.
        </p>
      </Section>

      <Section id="cookies" title="Cookies and storage">
        <p>
          One cookie keeps you signed in, and your light or dark theme choice is saved in your browser. Nothing is used for tracking or
          advertising.
        </p>
      </Section>

      <Section id="keep" title="How long we keep it">
        <dl className="divide-y divide-border">
          {[
            ["Sign-in links", "30 minutes, or until used"],
            ["Invitations", "7 days"],
            ["Signed-in sessions", "Up to 30 days since you last used ambagan"],
            ["Email log", "90 days"],
            ["Backups", `${env.BACKUP_KEEP} days, then they roll off`],
            ["Statements and payment records", "While the group uses ambagan, or until you ask us to remove your personal data (see below)"],
          ].map(([what, how]) => (
            <div key={what} className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-6">
              <dt className="font-semibold">{what}</dt>
              <dd className="text-muted-foreground sm:text-right">{how}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="rights" title="Your rights">
        <p>Under the Data Privacy Act you have the right to:</p>
        <List>
          <li>be informed about how your information is used (this page);</li>
          <li>access it, and get a copy;</li>
          <li>correct it if it is wrong;</li>
          <li>object to how it is used, or withdraw your consent;</li>
          <li>have it erased or blocked;</li>
          <li>receive it in a common format you can move elsewhere;</li>
          <li>be compensated for damage caused by unlawful use of it; and</li>
          <li>complain to the National Privacy Commission at privacy.gov.ph.</li>
        </List>
        <p>
          To use any of these, email{" "}
          <a href={`mailto:${contact}`} className="font-semibold underline underline-offset-4">
            {contact}
          </a>
          . If you leave the group, ask the admin to remove your personal data: your name, email, sign-in links and notes are deleted, and your
          past statements and payments stay in the group&apos;s records but no longer say who you were. Old backups still hold your details
          until they roll off.
        </p>
      </Section>

      <Section id="changes" title="Changes to this policy">
        <p>If this policy changes in a way that matters, the date above changes and the admin will let the group know.</p>
      </Section>

      <p className="pb-6 text-sm text-muted-foreground">
        <Link href="/" className="font-semibold underline underline-offset-4">
          Back to ambagan
        </Link>
      </p>
    </div>
  );
}
