import { describe, it, expect } from "vitest";
import { requireSignedIn, requireVerifiedEmail, normalizeEmail, parsePin, parseQuizId } from "./auth";
import { GameError } from "./errors";

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof GameError ? e.code : "other";
  }
  return undefined;
}

describe("requireSignedIn", () => {
  it("rejects missing auth", () => {
    expect(code(() => requireSignedIn(undefined))).toBe("unauthenticated");
  });
  it("returns uid", () => {
    expect(requireSignedIn({ uid: "u1", token: {} })).toBe("u1");
  });
});

describe("requireVerifiedEmail", () => {
  it("rejects anonymous / no email", () => {
    expect(code(() => requireVerifiedEmail({ uid: "u", token: {} }))).toBe("permission-denied");
  });
  it("rejects unverified email", () => {
    expect(code(() => requireVerifiedEmail({ uid: "u", token: { email: "a@b.c", email_verified: false } }))).toBe(
      "permission-denied",
    );
  });
  it("returns normalized email when verified", () => {
    expect(requireVerifiedEmail({ uid: "u", token: { email: " Host@Example.com ", email_verified: true } })).toBe(
      "host@example.com",
    );
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => expect(normalizeEmail(" A@B.Com")).toBe("a@b.com"));
});

describe("parsePin", () => {
  it("accepts a valid pin", () => expect(parsePin({ pin: "123456" })).toBe("123456"));
  it.each([undefined, null, {}, { pin: 123456 }, { pin: "012345" }, { pin: "12/456" }])("rejects %j", (d) => {
    expect(code(() => parsePin(d))).toBe("invalid-argument");
  });
});

describe("parseQuizId", () => {
  it("accepts a plain id", () => expect(parseQuizId({ quizId: "abc_123-X" })).toBe("abc_123-X"));
  it.each([undefined, {}, { quizId: "" }, { quizId: "a/b" }, { quizId: 5 }, { quizId: "x".repeat(200) }, { quizId: ".." }])(
    "rejects %j",
    (d) => {
      expect(code(() => parseQuizId(d))).toBe("invalid-argument");
    },
  );
});
