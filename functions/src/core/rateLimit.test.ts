import { describe, it, expect } from "vitest";
import { rateLimitStep } from "./rateLimit";

const opts = { limit: 3, windowMs: 60_000 };

describe("rateLimitStep (fixed window per key)", () => {
  it("allows `limit` calls per window, then refuses until the window ends", () => {
    let doc = null;
    for (let i = 0; i < 3; i++) {
      const r = rateLimitStep(doc, 1_000 + i, opts);
      expect(r.allowed).toBe(true);
      doc = r.doc;
    }
    const refused = rateLimitStep(doc, 2_000, opts);
    expect(refused.allowed).toBe(false);
    expect(refused.doc.count).toBe(3); // a refused call is not counted
    const next = rateLimitStep(refused.doc, 61_001, opts);
    expect(next).toMatchObject({ allowed: true, doc: { count: 1, windowStart: 61_001 } });
  });

  it("stores when the record may be deleted (Firestore TTL)", () => {
    expect(rateLimitStep(null, 5_000, opts).doc.expireAt).toBe(5_000 + 60_000);
  });

  it("treats a corrupt record as empty", () => {
    expect(rateLimitStep({ count: "x" } as never, 10, opts)).toMatchObject({ allowed: true, doc: { count: 1 } });
  });
});
