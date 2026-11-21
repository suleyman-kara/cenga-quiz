import { describe, it, expect } from "vitest";
import { club } from "../club.config";
import { choiceForId, someoneCorrect, tiltForId } from "./stageMoments";

describe("someoneCorrect", () => {
  it("is true only when at least one player chose the correct option", () => {
    expect(someoneCorrect({ qIndex: 0, correct: 1, counts: [4, 7] })).toBe(true);
    expect(someoneCorrect({ qIndex: 0, correct: 1, counts: [4, 0] })).toBe(false);
    expect(someoneCorrect({ qIndex: 0, correct: 2, counts: [4, 1] })).toBe(false);
    expect(someoneCorrect({ qIndex: 0, correct: 0, counts: [] })).toBe(false);
  });
});

describe("choiceForId", () => {
  it("is stable for the same id and always a valid choice index", () => {
    for (const id of ["a", "u1", "xYz-123", ""]) {
      const c = choiceForId(id);
      expect(c).toBe(choiceForId(id));
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(club.choices.length);
    }
  });

  it("spreads players over all the choice colours", () => {
    const used = new Set(Array.from({ length: 40 }, (_, i) => choiceForId(`uid-${i}`)));
    expect(used.size).toBe(club.choices.length);
  });
});

describe("tiltForId", () => {
  it("gives a small stable tilt in degrees", () => {
    const tilt = tiltForId("u1");
    expect(tilt).toBe(tiltForId("u1"));
    expect(Math.abs(tilt)).toBeLessThanOrEqual(12);
    expect(new Set(Array.from({ length: 30 }, (_, i) => tiltForId(`p${i}`))).size).toBeGreaterThan(2);
  });
});
