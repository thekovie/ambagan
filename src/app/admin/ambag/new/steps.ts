/** The new-ambag wizard: what each step is called, and what has to be true before moving on from it. */
export const STEPS = [
  { label: "The bill", heading: "What was it for?" },
  { label: "Who's in", heading: "Who's in?" },
  { label: "Split & send", heading: "How to split it" },
] as const;

export const LAST_STEP = STEPS.length - 1;

/**
 * Why the admin cannot move past this step yet, or null when they can. The last step is never blocked here: its own
 * summary says what is missing, and the server checks everything again on save.
 */
export function stepBlocker(step: number, state: { title: string; includedCount: number }): string | null {
  if (step === 0 && state.title.trim().length === 0) return "Say what it was for.";
  if (step === 1 && state.includedCount === 0) return "Choose who's in.";
  return null;
}
