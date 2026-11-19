import { describe, it, expect } from "vitest";
import { sanitizePlayerNames } from "./sanitize";
import type { PlayerEntry } from "../../../shared/types";

const players = (list: [string, string, number][]): Record<string, PlayerEntry> =>
  Object.fromEntries(list.map(([uid, name, joinedAt]) => [uid, { name, joinedAt }]));

describe("sanitizePlayerNames", () => {
  it("returns only the changes; clean unique names are untouched", () => {
    expect(sanitizePlayerNames(players([["a", "Ali", 1], ["b", "Banu", 2]]), "Oyuncu")).toEqual({});
  });
  it("replaces blocked names with a neutral generated name", () => {
    const out = sanitizePlayerNames(players([["a", "Ali", 1], ["b", "s1kt1r", 2], ["c", "orospu", 3]]), "Oyuncu");
    expect(out).toEqual({ b: "Oyuncu 1", c: "Oyuncu 2" });
  });
  it("generated names skip names already taken", () => {
    const out = sanitizePlayerNames(players([["a", "Oyuncu 1", 1], ["b", "amk", 2]]), "Oyuncu");
    expect(out).toEqual({ b: "Oyuncu 2" });
  });
  it("suffixes case-insensitive duplicates in join order (Turkish-aware)", () => {
    const out = sanitizePlayerNames(
      players([["x", "ali", 5], ["a", "Ali", 1], ["b", "ALİ", 3], ["c", "Işık", 4], ["d", "IŞIK", 6]]),
      "Oyuncu",
    );
    expect(out).toEqual({ b: "ALİ (2)", x: "ali (3)", d: "IŞIK (2)" });
  });
  it("a suffixed name never collides with an existing one and stays within 20 chars", () => {
    const out = sanitizePlayerNames(
      players([["a", "Ali", 1], ["b", "Ali (2)", 2], ["c", "ali", 3], ["d", "Abcdefghijklmnopqrst", 4], ["e", "abcdefghijklmnopqrst", 5]]),
      "Oyuncu",
    );
    expect(out.c).toBe("ali (3)");
    expect(out.e).toBe("abcdefghijklmnop (2)");
    expect(out.e.length).toBeLessThanOrEqual(20);
    expect(Object.keys(out).sort()).toEqual(["c", "e"]);
  });
});
