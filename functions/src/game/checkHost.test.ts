import { describe, it, expect, vi } from "vitest";
import { GameError } from "../core/errors";
import { MAX_EMAIL_LENGTH, createCheckHostEmail, parseHostEmail } from "./checkHost";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof GameError ? e.code : "other";
  }
  return "none";
};

describe("parseHostEmail", () => {
  it("trims and lowercases", () => {
    expect(parseHostEmail({ email: "  Host@Example.ORG " })).toBe("host@example.org");
  });
  it("rejects missing, non-string, malformed and over-long input", () => {
    expect(code(() => parseHostEmail(null))).toBe("invalid-argument");
    expect(code(() => parseHostEmail({}))).toBe("invalid-argument");
    expect(code(() => parseHostEmail({ email: 42 }))).toBe("invalid-argument");
    expect(code(() => parseHostEmail({ email: "" }))).toBe("invalid-argument");
    expect(code(() => parseHostEmail({ email: "no-at-sign" }))).toBe("invalid-argument");
    expect(code(() => parseHostEmail({ email: "a@b" }))).toBe("invalid-argument");
    expect(code(() => parseHostEmail({ email: "a b@c.de" }))).toBe("invalid-argument");
    expect(code(() => parseHostEmail({ email: "a@b@c.de" }))).toBe("invalid-argument");
    expect(code(() => parseHostEmail({ email: "x/../y@c.de" }))).toBe("invalid-argument");
    const long = `${"a".repeat(MAX_EMAIL_LENGTH)}@c.de`;
    expect(code(() => parseHostEmail({ email: long }))).toBe("invalid-argument");
  });
});

describe("createCheckHostEmail", () => {
  it("returns only a boolean, looking up the normalized e-mail", async () => {
    const lookup = vi.fn(async (e: string) => e === "host@example.org");
    const check = createCheckHostEmail(lookup);
    expect(await check({ email: " HOST@example.org" })).toEqual({ allowed: true });
    expect(await check({ email: "other@example.org" })).toEqual({ allowed: false });
    expect(lookup).toHaveBeenNthCalledWith(1, "host@example.org");
  });
  it("does not look anything up for invalid input", async () => {
    const lookup = vi.fn(async () => true);
    const check = createCheckHostEmail(lookup);
    await expect(check({ email: "bad" })).rejects.toBeInstanceOf(GameError);
    expect(lookup).not.toHaveBeenCalled();
  });
  it("normalizes a truthy lookup result to a strict boolean", async () => {
    const check = createCheckHostEmail(async () => 1 as unknown as boolean);
    expect(await check({ email: "a@b.co" })).toEqual({ allowed: true });
  });
});
