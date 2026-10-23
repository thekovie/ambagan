import { parsePesosToMinor } from "@/lib/money";

/** The new-ambag wizard: what each step is called, and what has to be true before moving on from it. */
export const STEPS = [
  { label: "The bill", heading: "What was it for?" },
  { label: "Who's in", heading: "Who's in?" },
  // Short on purpose: three labels have to fit side by side on a phone.
  { label: "Split", heading: "How to split it" },
] as const;

export const TOTAL_ERROR = "That total isn't an amount. Use pesos, like 1,500.50.";

/** Why the typed total can't be used, or null: blank is fine (an itemised bill adds up from its items). */
export function totalProblem(method: string, totalText: string): string | null {
  if (method === "ITEMS" || totalText.trim() === "") return null;
  return parsePesosToMinor(totalText) === null ? TOTAL_ERROR : null;
}

export const LAST_STEP = STEPS.length - 1;

/**
 * Why the admin cannot move past this step yet, or null when they can. The last step is never blocked here: its own
 * summary says what is missing, and the server checks everything again on save.
 */
export function stepBlocker(step: number, state: { title: string; includedCount: number; method: string; totalText: string }): string | null {
  if (step === 0 && state.title.trim().length === 0) return "Say what it was for.";
  if (step === 0) return totalProblem(state.method, state.totalText);
  if (step === 1 && state.includedCount === 0) return "Choose who's in.";
  return null;
}
