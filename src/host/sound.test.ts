import { describe, it, expect } from "vitest";
import { SOUNDS, soundCue, type StageSnapshot } from "./sound";

const snap = (over: Partial<StageSnapshot> = {}): StageSnapshot => ({
  phase: "lobby",
  qIndex: -1,
  players: 0,
  secondsLeft: null,
  ...over,
});

describe("soundCue", () => {
  it("plays nothing on the first snapshot (page load / reload)", () => {
    expect(soundCue(null, snap({ phase: "question", qIndex: 2, secondsLeft: 3 }))).toEqual([]);
  });

  it("pops when a player joins the lobby, not when one leaves", () => {
    expect(soundCue(snap({ players: 2 }), snap({ players: 3 }))).toEqual(["join"]);
    expect(soundCue(snap({ players: 3 }), snap({ players: 2 }))).toEqual([]);
    expect(soundCue(snap({ players: 2 }), snap({ players: 9 }))).toEqual(["join"]);
  });

  it("chimes when a question starts (from lobby, leaderboard or reveal)", () => {
    expect(soundCue(snap(), snap({ phase: "question", qIndex: 0, secondsLeft: 20 }))).toEqual(["question"]);
    expect(
      soundCue(snap({ phase: "leaderboard", qIndex: 0 }), snap({ phase: "question", qIndex: 1, secondsLeft: 20 })),
    ).toEqual(["question"]);
    expect(
      soundCue(snap({ phase: "reveal", qIndex: 0 }), snap({ phase: "question", qIndex: 1, secondsLeft: 20 })),
    ).toEqual(["question"]);
  });

  it("ticks once per second during the last 5 seconds only", () => {
    const q = (s: number | null) => snap({ phase: "question", qIndex: 0, secondsLeft: s });
    expect(soundCue(q(7), q(6))).toEqual([]);
    expect(soundCue(q(6), q(5))).toEqual(["tick"]);
    expect(soundCue(q(2), q(1))).toEqual(["tick"]);
    expect(soundCue(q(1), q(1))).toEqual([]);
    expect(soundCue(q(1), q(0))).toEqual([]);
    // lead-in (before the timer starts) is silent
    expect(soundCue(q(null), q(null))).toEqual([]);
  });

  it("reveal, leaderboard and podium each have their own sound", () => {
    const q = snap({ phase: "question", qIndex: 3, secondsLeft: 0 });
    expect(soundCue(q, snap({ phase: "reveal", qIndex: 3 }))).toEqual(["reveal"]);
    expect(soundCue(snap({ phase: "reveal", qIndex: 3 }), snap({ phase: "leaderboard", qIndex: 3 }))).toEqual([
      "leaderboard",
    ]);
    expect(soundCue(snap({ phase: "leaderboard", qIndex: 3 }), snap({ phase: "ended", qIndex: 3 }))).toEqual([
      "fanfare",
    ]);
  });

  it("no sound when nothing changed", () => {
    const s = snap({ phase: "reveal", qIndex: 1, players: 5 });
    expect(soundCue(s, { ...s })).toEqual([]);
  });
});

describe("SOUNDS", () => {
  it("every sound is short and audible", () => {
    for (const [name, tones] of Object.entries(SOUNDS)) {
      expect(tones.length, name).toBeGreaterThan(0);
      const end = Math.max(...tones.map((tn) => tn.at + tn.dur));
      expect(end, name).toBeLessThanOrEqual(2.5);
      for (const tn of tones) {
        expect(tn.f, name).toBeGreaterThan(20);
        expect(tn.gain ?? 0.2, name).toBeLessThanOrEqual(0.4);
      }
    }
  });
});
