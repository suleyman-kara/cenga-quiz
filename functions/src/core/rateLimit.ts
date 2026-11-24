/** Fixed-window rate limit, pure: the IO layer stores `doc` per key (rateLimits/{key}). */
export interface RateLimitDoc {
  windowStart: number;
  count: number;
  /** ms; stored as a Firestore Timestamp so the TTL policy deletes old records */
  expireAt: number;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export function rateLimitStep(
  cur: RateLimitDoc | null | undefined,
  now: number,
  opts: RateLimitOptions,
): { allowed: boolean; doc: RateLimitDoc } {
  const valid = !!cur && Number.isFinite(cur.windowStart) && Number.isFinite(cur.count);
  if (!valid || now - cur!.windowStart >= opts.windowMs) {
    return { allowed: true, doc: { windowStart: now, count: 1, expireAt: now + opts.windowMs } };
  }
  if (cur!.count >= opts.limit) return { allowed: false, doc: cur! };
  return { allowed: true, doc: { ...cur!, count: cur!.count + 1 } };
}
