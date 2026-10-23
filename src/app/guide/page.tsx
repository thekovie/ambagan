import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { cn } from "@/lib/utils";
import { guideFor, type GuideSection } from "./content";

export const metadata: Metadata = { title: "How it works" };

// Pastel chips for the step numbers, so each step is easy to find again.
const CHIP = ["bg-st-sky", "bg-st-mint", "bg-st-butter", "bg-st-peach", "bg-st-rose", "bg-st-lilac"];

function Section({ section, level }: { section: GuideSection; level: "h2" | "h3" }) {
  const Heading = level;
  return (
    <section id={section.id} aria-labelledby={`${section.id}-title`} className="sheet flex max-w-2xl scroll-mt-20 flex-col gap-5 p-5 sm:p-6">
      <div>
        <Heading id={`${section.id}-title`} className="font-display text-title">
          {section.title}
        </Heading>
        {section.intro ? <p className="mt-1 text-muted-foreground">{section.intro}</p> : null}
      </div>
      <ol className="flex flex-col gap-5">
        {section.steps.map((step, index) => (
          <li key={step.title} className="flex items-start gap-3">
            <span aria-hidden="true" className={cn("grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold text-st-ink", CHIP[index % CHIP.length])}>
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-bold">{step.title}</p>
              <p className="text-muted-foreground">{step.body}</p>
              {step.link ? (
                <p className="mt-1">
                  <Link href={step.link.href} className="inline-flex min-h-11 items-center gap-1 font-semibold text-foreground underline underline-offset-4">
                    {step.link.label} <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** "How ambagan works": for a member, how to pay and report; for an admin, setup and running the group, then what friends see. */
export default async function GuidePage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const { yours, theirs } = guideFor(isAdmin ? "ADMIN" : "MEMBER");
  // Jump links: an admin gets their own sections plus one jump to what friends see; a member gets every section.
  const jumps = isAdmin ? [...yours.map((s) => ({ id: s.id, title: s.title })), { id: "friends", title: "What your friends see" }] : yours.map((s) => ({ id: s.id, title: s.title }));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-display">How ambagan works</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          {isAdmin
            ? "You collect for the group, so this starts with setting things up, then the monthly routine. What your friends see comes last."
            : "A friend collects for the group and ambagan keeps track. Here's everything you need, in the order you'll use it."}
        </p>
      </header>

      {jumps.length > 4 ? (
        <nav aria-label="On this page" className="flex flex-wrap gap-2">
          {jumps.map((jump) => (
            <a key={jump.id} href={`#${jump.id}`} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold hover:bg-muted">
              {jump.title}
            </a>
          ))}
        </nav>
      ) : null}

      {isAdmin ? (
        <>
          <h2 className="font-display text-title text-muted-foreground">For you, the admin</h2>
          <div className="flex flex-col gap-6">
            {yours.map((section) => (
              <Section key={section.id} section={section} level="h3" />
            ))}
          </div>
          <div id="friends" className="scroll-mt-20">
            <h2 className="font-display text-title text-muted-foreground">What your friends see</h2>
            <p className="mt-1 max-w-2xl text-muted-foreground">So you know what&apos;s on their phone and in their inbox.</p>
          </div>
          <div className="flex flex-col gap-6">
            {theirs.map((section) => (
              <Section key={section.id} section={section} level="h3" />
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-6">
          {yours.map((section) => (
            <Section key={section.id} section={section} level="h2" />
          ))}
        </div>
      )}
    </div>
  );
}
