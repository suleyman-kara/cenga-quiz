import { describe, it, expect } from "vitest";
import { generatePin, isValidPin } from "./pin";

describe("generatePin", () => {
  it("returns a 6-digit string not starting with 0 (default Math.random)", () => {
    for (let i = 0; i < 500; i++) {
      const p = generatePin();
      expect(p).toMatch(/^[1-9]\d{5}$/);
      expect(isValidPin(p)).toBe(true);
    }
  });

  it("maps random()=0 to 100000", () => {
    expect(generatePin(() => 0)).toBe("100000");
  });

  it("maps random() just below 1 to 999999", () => {
    expect(generatePin(() => 0.9999999999)).toBe("999999");
  });

  it("stays in range even if random() misbehaves (returns 1 or negative)", () => {
    expect(generatePin(() => 1)).toBe("999999");
    expect(generatePin(() => -0.5)).toBe("100000");
  });

  it("is deterministic for a given random source", () => {
    expect(generatePin(() => 0.5)).toBe("550000");
    expect(generatePin(() => 0.123456)).toBe(generatePin(() => 0.123456));
  });
});

describe("isValidPin", () => {
  it.each(["100000", "999999", "123456", "500001"])("accepts %j", (p) => {
    expect(isValidPin(p)).toBe(true);
  });

  it.each([
    "012345",
    "12345",
    "1234567",
    "12a456",
    " 123456",
    "123456 ",
    "",
    "١٢٣٤٥٦", // non-ASCII digits
    123456,
    null,
    undefined,
    {},
    ["123456"],
  ])("rejects %j", (p) => {
    expect(isValidPin(p)).toBe(false);
  });
});
