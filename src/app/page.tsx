import { Wordmark } from "@/components/brand/wordmark";

// Placeholder until the auth milestone redirects `/` to /dashboard or /login.
export default function Home() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Wordmark className="scale-150" />
        <p className="mt-4 font-display text-4xl">split it, settle it.</p>
      </div>
    </main>
  );
}
