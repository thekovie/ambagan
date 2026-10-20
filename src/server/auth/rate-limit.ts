interface Options {
  limit: number;
  windowMs: number;
  now?: () => number;
  /** Upper bound on tracked keys; the oldest is evicted first. */
  maxKeys?: number;
}

interface Entry {
  count: number;
  resetAt: number;
}

const DEFAULT_MAX_KEYS = 2000;

/**
 * Fixed-window limiter held in process memory, bounded to `maxKeys` entries (O(1) eviction of the
 * oldest), so a flood of distinct keys can neither grow memory nor make every request scan the map.
 * ponytail: single-process only; move to the SQLite DB if the app ever runs more than one instance.
 */
export function createRateLimiter({ limit, windowMs, now = Date.now, maxKeys = DEFAULT_MAX_KEYS }: Options) {
  const entries = new Map<string, Entry>();

  return {
    size: () => entries.size,
    /** Whether `key` has used up its allowance in the current window. Asking does not count as an attempt. */
    isLimited(key: string): boolean {
      const entry = entries.get(key);
      return Boolean(entry) && now() < entry!.resetAt && entry!.count >= limit;
    },
    hit(key: string): { allowed: boolean; retryAfterMs: number } {
      const t = now();
      const entry = entries.get(key);
      if (!entry || t >= entry.resetAt) {
        entries.delete(key);
        if (entries.size >= maxKeys) entries.delete(entries.keys().next().value as string);
        entries.set(key, { count: 1, resetAt: t + windowMs });
        return { allowed: true, retryAfterMs: 0 };
      }
      if (entry.count >= limit) return { allowed: false, retryAfterMs: entry.resetAt - t };
      entries.set(key, { ...entry, count: entry.count + 1 });
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}
