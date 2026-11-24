/** checkHostEmail through the Functions emulator: answers per address, limited per caller IP. */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { adminFs, allowHost, anonymousCaller, disposeClients, expectCode, resetEmulators } from "./helpers";

describe("checkHostEmail", () => {
  beforeEach(resetEmulators);
  afterAll(disposeClients);

  it("answers only allowed / not allowed, for signed-out callers too", async () => {
    await allowHost("host@example.com");
    const c = anonymousCaller();
    expect(await c.callRaw("checkHostEmail", { email: "HOST@example.com" })).toEqual({ allowed: true });
    expect(await c.callRaw("checkHostEmail", { email: "nobody@example.com" })).toEqual({ allowed: false });
  });

  it("refuses after 20 checks an hour from one IP (no testing a list of addresses); stores only a hash", async () => {
    const c = anonymousCaller();
    for (let i = 0; i < 20; i++) await c.callRaw("checkHostEmail", { email: `u${i}@example.com` });
    expect(await expectCode(c.callRaw("checkHostEmail", { email: "last@example.com" }))).toBe("functions/resource-exhausted");
    const docs = (await adminFs().collection("rateLimits").get()).docs;
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toMatch(/^checkHostEmail_[0-9a-f]{32}$/);
    expect(JSON.stringify(docs[0].data())).not.toMatch(/127\.0\.0\.1|::1/);
  });
});
