/** FNV-1a, 32 bit. Only used to break rounding ties the same way on every run and on every machine. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Murmur3's finaliser: FNV-1a alone mixes the last character weakly, which would bias who wins close ties. */
function scramble(hash: number): number {
  let h = hash;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export interface Weighted {
  key: string;
  /** A whole number, zero or more. Zero means "pays nothing". */
  weight: number;
}

/**
 * Splits `total` (whole centavos) in proportion to the weights so the parts add up to the total exactly
 * (largest-remainder method). Products use BigInt so the largest totals and weights stay exact.
 *
 * The leftover centavos go to the biggest remainders. Ties break by bigger weight, then by a hash of
 * `seed + key` (so the odd centavo lands on a different person bill after bill instead of always the same
 * one), then by key, which makes the order of `entries` irrelevant. Someone with zero weight never gets one.
 */
export function apportion(total: number, entries: readonly Weighted[], seed: string): Map<string, number> {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError("The total must be a whole number of centavos, zero or more");
  if (entries.length === 0) throw new RangeError("Apportioning needs at least one entry");

  const seen = new Set<string>();
  let weightSum = BigInt(0);
  for (const { key, weight } of entries) {
    if (!Number.isSafeInteger(weight) || weight < 0) throw new RangeError(`Invalid weight for "${key}"`);
    if (seen.has(key)) throw new RangeError(`Duplicate key "${key}"`);
    seen.add(key);
    weightSum += BigInt(weight);
  }
  if (weightSum === BigInt(0)) throw new RangeError("At least one weight must be above zero");

  const bigTotal = BigInt(total);
  const rows = entries.map(({ key, weight }) => {
    const product = bigTotal * BigInt(weight);
    return { key, weight, floor: product / weightSum, remainder: product % weightSum, tie: scramble(fnv1a(`${seed}:${key}`)) };
  });

  const leftover = Number(bigTotal - rows.reduce((sum, row) => sum + row.floor, BigInt(0)));
  const byClaim = [...rows].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    if (a.weight !== b.weight) return b.weight - a.weight;
    if (a.tie !== b.tie) return a.tie - b.tie;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  const extra = new Set(byClaim.slice(0, leftover).map((row) => row.key));

  return new Map(rows.map((row) => [row.key, Number(row.floor) + (extra.has(row.key) ? 1 : 0)]));
}
