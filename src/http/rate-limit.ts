/** Small in-memory fixed-window limiter per key (client IP). Enough for a single-process server. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  allow(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size > 10_000) {
        for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
      }
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}
