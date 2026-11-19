import { describe, it, expect } from "vitest";
import { NAME_MAX, NAME_PATTERN_SOURCE, normalizeName, isValidName } from "./names";

describe("NAME_MAX / NAME_PATTERN_SOURCE", () => {
  it("NAME_MAX is 20", () => {
    expect(NAME_MAX).toBe(20);
  });

  it("is a string usable as a RegExp without flags, anchored on both ends", () => {
    expect(typeof NAME_PATTERN_SOURCE).toBe("string");
    expect(NAME_PATTERN_SOURCE.startsWith("^")).toBe(true);
    expect(NAME_PATTERN_SOURCE.endsWith("$")).toBe(true);
    expect(() => new RegExp(NAME_PATTERN_SOURCE)).not.toThrow();
  });

  it("does not use regex features unsupported by RTDB rules (no lookarounds, no \\p, no \\u escapes)", () => {
    expect(NAME_PATTERN_SOURCE).not.toMatch(/\(\?/);
    expect(NAME_PATTERN_SOURCE).not.toMatch(/\\p\{/);
    expect(NAME_PATTERN_SOURCE).not.toMatch(/\\u/);
  });

  it("matches allowed names and rejects others", () => {
    const re = new RegExp(NAME_PATTERN_SOURCE);
    expect(re.test("Ali")).toBe(true);
    expect(re.test("çğıöşü ÇĞİÖŞÜ")).toBe(true);
    expect(re.test("a_b.c-d 9")).toBe(true);
    expect(re.test("x".repeat(20))).toBe(true);
    expect(re.test("x".repeat(21))).toBe(false);
    expect(re.test("")).toBe(false);
    expect(re.test("<script>")).toBe(false);
    expect(re.test("a/b")).toBe(false);
    expect(re.test("ab\n")).toBe(false);
  });
});

describe("normalizeName", () => {
  it("trims leading/trailing whitespace", () => {
    expect(normalizeName("  Ayşe  ")).toBe("Ayşe");
  });

  it("collapses inner whitespace runs (incl. tabs/newlines) to a single space", () => {
    expect(normalizeName("Ali   Veli\t\tDeli\nX")).toBe("Ali Veli Deli X");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeName("   \t ")).toBe("");
  });

  it("composes decomposed characters (NFC) so they match the pattern", () => {
    // "I" + COMBINING DOT ABOVE → "İ"
    expect(normalizeName("İrem")).toBe("İrem");
    expect(isValidName(normalizeName("İrem"))).toBe(true);
  });

  it("leaves already-normal names untouched", () => {
    expect(normalizeName("Gül_Şen.99")).toBe("Gül_Şen.99");
  });
});

describe("isValidName", () => {
  it.each(["Ali", "Çağrı", "ığüşöçİĞÜŞÖÇ", "a", "Team-7", "j.doe", "x_y", "Ali Veli", "x".repeat(20)])(
    "accepts %j",
    (n) => {
      expect(isValidName(n)).toBe(true);
    },
  );

  it.each([
    "",
    " ",
    "     ",
    "x".repeat(21),
    "emoji😀",
    "a<b",
    "a@b",
    "naïve", // ï not allowed
    "Ali\tVeli",
    "ab/cd",
  ])("rejects %j", (n) => {
    expect(isValidName(n)).toBe(false);
  });

  it("validates the normalized form (so surrounding/inner extra spaces are fine)", () => {
    expect(isValidName("  Ali    Veli ")).toBe(true);
  });

  it("rejects names that are too long even after normalization", () => {
    expect(isValidName("  " + "a".repeat(21) + "  ")).toBe(false);
  });

  it("accepts a name that becomes <=20 only after collapsing whitespace", () => {
    expect(isValidName("aaaaaaaaa          bbbbbbbbbb")).toBe(true); // 9 + 1 + 10 = 20
  });

  it("rejects non-string input defensively", () => {
    expect(isValidName(undefined as unknown as string)).toBe(false);
    expect(isValidName(42 as unknown as string)).toBe(false);
  });
});
