/** IO side of the per-key rate limit: one small Firestore doc per key, deleted by TTL. */
import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { rateLimitStep, type RateLimitDoc, type RateLimitOptions } from "../core/rateLimit";
import { firestore } from "./firebase";

/** Never store a raw IP: only a hash of it (scoped by `bucket`). */
export function rateLimitKey(bucket: string, caller: string): string {
  return `${bucket}_${createHash("sha256").update(`${bucket}|${caller}`).digest("hex").slice(0, 32)}`;
}

export function createLimiter(bucket: string, opts: RateLimitOptions) {
  return async (caller: string): Promise<boolean> => {
    const fs = await firestore();
    const ref = fs.doc(`rateLimits/${rateLimitKey(bucket, caller)}`);
    return fs.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const raw = snap.exists ? (snap.data() as Omit<RateLimitDoc, "expireAt"> & { expireAt?: Timestamp }) : null;
      const cur = raw ? { windowStart: raw.windowStart, count: raw.count, expireAt: raw.expireAt?.toMillis() ?? 0 } : null;
      const { allowed, doc } = rateLimitStep(cur, Date.now(), opts);
      if (allowed) tx.set(ref, { ...doc, expireAt: Timestamp.fromMillis(doc.expireAt) });
      return allowed;
    });
  };
}
