type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Límite simple en memoria, por instancia. Suficiente para este servidor único. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}
