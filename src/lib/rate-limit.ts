/**
 * A tiny in-memory rate limiter.
 *
 * It protects the form endpoints against a single client flooding them. The
 * state lives in the isolate, so it is best-effort: a request can still be
 * spread over several isolates. That is good enough to stop casual abuse
 * without adding a KV binding to the project.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Maximum number of buckets kept in memory before the oldest ones are pruned. */
const MAX_BUCKETS = 5000;

/**
 * Register a hit for `key`.
 *
 * Returns `false` when the limit has been reached, in which case the caller
 * should reject the request.
 */
export function checkRateLimit(key: string, limit = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });

    if (buckets.size > MAX_BUCKETS) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }

    return true;
  }

  if (bucket.count >= limit) return false;

  bucket.count += 1;
  return true;
}

/** Forget every bucket — used by the tests. */
export function resetRateLimit(): void {
  buckets.clear();
}
