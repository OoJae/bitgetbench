// A tiny in-memory token-bucket rate limiter, keyed per client (IP or API key). No external
// dependency: the API is a single long-lived process, so an in-memory map is sufficient. nginx
// adds a second layer in front in production. The map is bounded and sweeps full/idle buckets so
// a rotating key (even behind a spoofed header) cannot grow memory without limit.

interface Bucket {
  tokens: number;
  updated: number;
}

const MAX_BUCKETS = 50_000;

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {}

  /** Take one token for `key`. Returns true if allowed, false if the bucket is empty. */
  take(key: string, now = Date.now()): boolean {
    const b = this.buckets.get(key) ?? { tokens: this.capacity, updated: now };
    const elapsedSec = Math.max(0, (now - b.updated) / 1000);
    b.tokens = Math.min(this.capacity, b.tokens + elapsedSec * this.refillPerSec);
    b.updated = now;
    const allowed = b.tokens >= 1;
    if (allowed) b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > MAX_BUCKETS) this.sweep(now);
    return allowed;
  }

  /** Drop buckets that have refilled back to full (they carry no state worth keeping). */
  private sweep(now: number): void {
    for (const [key, b] of this.buckets) {
      const refilled = b.tokens + ((now - b.updated) / 1000) * this.refillPerSec;
      if (refilled >= this.capacity) this.buckets.delete(key);
    }
    // If a flood of distinct keys is all still rate-limited, drop the oldest to stay bounded.
    if (this.buckets.size > MAX_BUCKETS) {
      const excess = this.buckets.size - MAX_BUCKETS;
      let i = 0;
      for (const key of this.buckets.keys()) {
        if (i++ >= excess) break;
        this.buckets.delete(key);
      }
    }
  }
}
