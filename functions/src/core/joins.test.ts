import { describe, it, expect } from "vitest";
import { NAME_MAX } from "../../../shared/names";
import { fullAfterCount, nameClaimKey, suffixedName } from "./joins";

describe("name claims (join trigger without reading every player)", () => {
  it("nameClaimKey is case-insensitive (Turkish İ/I aware) and a valid RTDB key", () => {
    expect(nameClaimKey("ALİ")).toBe(nameClaimKey("ali"));
    expect(nameClaimKey("IŞIK")).toBe(nameClaimKey("ışık"));
    expect(nameClaimKey("Ali")).not.toBe(nameClaimKey("Ali (2)"));
    for (const n of ["a.b", "x/y", "#1", "$", "[z]", "Ali Veli", "ç.ş"]) expect(nameClaimKey(n)).not.toMatch(/[.#$\/\[\]]/);
  });

  it("suffixedName: ' (n)' appended, the name shortened so the result still fits", () => {
    expect(suffixedName("Ali", 2)).toBe("Ali (2)");
    const long = suffixedName("x".repeat(40), 12);
    expect(long.endsWith(" (12)")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(NAME_MAX);
  });

  it("fullAfterCount: full at maxPlayers, open below", () => {
    expect(fullAfterCount(299, 300)).toBe(false);
    expect(fullAfterCount(300, 300)).toBe(true);
    expect(fullAfterCount(301, 300)).toBe(true);
  });
});
