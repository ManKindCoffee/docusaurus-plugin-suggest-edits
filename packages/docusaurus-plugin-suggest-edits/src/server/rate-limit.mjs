// Allows up to `max` hits per key within a rolling window
export function createRateLimiter({max, windowMs = 60 * 60 * 1000, now = () => Date.now()}) {
  const hits = new Map(); // key → timestamps

  return function check(key) {
    const t = now();

    // Stop the map growing forever
    if (hits.size > 10_000) {
      for (const [k, stamps] of hits) {
        if (stamps.every((ts) => t - ts >= windowMs)) hits.delete(k);
      }
    }

    const recent = (hits.get(key) || []).filter((ts) => t - ts < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return {ok: false, retryAfterSeconds: Math.ceil((recent[0] + windowMs - t) / 1000)};
    }
    recent.push(t);
    hits.set(key, recent);
    return {ok: true};
  };
}