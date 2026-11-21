import { describe, it, expect, vi } from "vitest";
import { createHostCheck, requireHostIdentity } from "./hostAuth";

describe("createHostCheck (allowedHosts cache)", () => {
  it("caches positive and negative answers per e-mail for the TTL", async () => {
    let now = 0;
    const allowed = new Set(["a@x.com"]);
    const lookup = vi.fn(async (email: string) => allowed.has(email));
    const check = createHostCheck(lookup, 60_000, () => now);
    expect(await check.isAllowed("a@x.com")).toBe(true);
    expect(await check.isAllowed("b@x.com")).toBe(false);
    allowed.delete("a@x.com");
    allowed.add("b@x.com");
    now = 59_999;
    expect(await check.isAllowed("a@x.com")).toBe(true);
    expect(await check.isAllowed("b@x.com")).toBe(false);
    expect(lookup).toHaveBeenCalledTimes(2);
    now = 60_001;
    expect(await check.isAllowed("a@x.com")).toBe(false);
    expect(await check.isAllowed("b@x.com")).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(4);
  });
  it("does not cache failed lookups", async () => {
    const lookup = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue(true);
    const check = createHostCheck(lookup, 60_000, () => 0);
    await expect(check.isAllowed("a@x.com")).rejects.toThrow("unavailable");
    expect(await check.isAllowed("a@x.com")).toBe(true);
  });
  it("stays bounded", async () => {
    const check = createHostCheck(async () => false, 60_000, () => 0, 3);
    for (const e of ["1", "2", "3", "4", "5"]) await check.isAllowed(e);
    expect(check.size()).toBeLessThanOrEqual(3);
  });
});

describe("requireHostIdentity (host callable)", () => {
  const codeOf = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return (e as { code?: string }).code;
    }
    return "none";
  };
  it("requires a signed-in caller", () => {
    expect(codeOf(() => requireHostIdentity(undefined))).toBe("unauthenticated");
  });
  it("rejects an unverified e-mail (email_verified must be true)", () => {
    expect(codeOf(() => requireHostIdentity({ uid: "u", token: { email: "h@x.com", email_verified: false } }))).toBe(
      "permission-denied",
    );
    expect(codeOf(() => requireHostIdentity({ uid: "u", token: { email: "h@x.com" } }))).toBe("permission-denied");
  });
  it("accepts a verified e-mail and normalizes it", () => {
    expect(requireHostIdentity({ uid: "u", token: { email: " H@X.com", email_verified: true } })).toEqual({
      uid: "u",
      email: "h@x.com",
    });
  });
});
