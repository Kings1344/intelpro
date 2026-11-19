/**
 * Fixed-window in-memory rate limiter. Per-instance only: on multi-instance
 * deployments put a shared store (e.g. Redis) behind the same interface.
 */
type Bucket = { count: number; resetAt: number };

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now = Date.now()): { ok: boolean; remaining: number; retryAfterSec: number } {
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      this.sweep(now);
      return { ok: true, remaining: this.limit - 1, retryAfterSec: 0 };
    }
    if (b.count >= this.limit) {
      return { ok: false, remaining: 0, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
    }
    b.count += 1;
    return { ok: true, remaining: this.limit - b.count, retryAfterSec: 0 };
  }

  private sweep(now: number) {
    if (this.buckets.size < 5000) return;
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}

export const limiters = {
  auth: new RateLimiter(10, 15 * 60_000), // 10 login/register attempts per 15 min per IP
  ai: new RateLimiter(20, 60 * 60_000), // 20 AI calls per hour per user
  write: new RateLimiter(120, 60_000), // general mutations
  fetch: new RateLimiter(30, 60 * 60_000), // outbound evidence retrievals
  email: new RateLimiter(5, 60 * 60_000), // verification / reset emails per user or IP
  upload: new RateLimiter(20, 60 * 60_000), // PDF uploads
  verify: new RateLimiter(30, 10 * 60_000), // public lock checks (each one is an RPC call)
};
