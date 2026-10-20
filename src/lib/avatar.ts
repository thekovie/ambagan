// Each friend keeps one pastel, picked from their name so it is the same on every screen and visit.
const AVATAR_COLORS = [
  "bg-st-peach text-st-ink",
  "bg-st-mint text-st-ink",
  "bg-st-lilac text-st-ink",
  "bg-st-sky text-st-ink",
  "bg-st-rose text-st-ink",
  "bg-st-butter text-st-ink",
];

export function avatarClass(seed: string): string {
  let sum = 0;
  for (const ch of seed) sum += ch.charCodeAt(0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

/** One or two capital letters from a name, or the first letter of the email when there is no name. */
export function initials(name: string | null | undefined, email: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return (email[0] ?? "?").toUpperCase();
  // Array.from keeps an emoji or other astral character whole instead of splitting its surrogate pair.
  const first = (word: string) => Array.from(word)[0];
  const letters = words.length === 1 ? first(words[0]) : first(words[0]) + first(words[words.length - 1]);
  return letters.toUpperCase();
}
