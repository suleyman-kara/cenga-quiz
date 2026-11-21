import { describe, it, expect } from "vitest";
import { SOUNDS, createJoinLimiter, musicFor, soundCue, type StageSnapshot } from "./sound";

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

  it("plays the 'get ready' riser when a question starts with its lead-in", () => {
    const leadIn = (qIndex: number) => snap({ phase: "question", qIndex, secondsLeft: null });
    expect(soundCue(snap(), leadIn(0))).toEqual(["leadIn"]);
    expect(soundCue(snap({ phase: "leaderboard", qIndex: 0 }), leadIn(1))).toEqual(["leadIn"]);
    expect(soundCue(snap({ phase: "reveal", qIndex: 0 }), leadIn(1))).toEqual(["leadIn"]);
  });

  it("hits 'go' when the answer timer starts after the lead-in", () => {
    const q = (s: number | null) => snap({ phase: "question", qIndex: 0, secondsLeft: s });
    expect(soundCue(q(null), q(20))).toEqual(["go"]);
    // missed the lead-in (e.g. the laptop was asleep): straight to "go"
    expect(soundCue(snap(), q(18))).toEqual(["go"]);
    // time up → null again: no second "go"
    expect(soundCue(q(1), q(null))).toEqual([]);
  });

  it("ticks once per second during the last 5 seconds only", () => {
    const q = (s: number | null) => snap({ phase: "question", qIndex: 0, secondsLeft: s });
    expect(soundCue(q(7), q(6))).toEqual([]);
    expect(soundCue(q(6), q(5))).toEqual(["tick"]);
    expect(soundCue(q(2), q(1))).toEqual(["tick"]);
    expect(soundCue(q(1), q(1))).toEqual([]);
    expect(soundCue(q(1), q(0))).toEqual([]);
    // lead-in (before the timer starts) is silent apart from the riser
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

describe("musicFor", () => {
  it("plays the lobby track in the lobby (also right after a reload)", () => {
    expect(musicFor(snap())).toEqual({ track: "lobby", double: false, urgent: false });
  });

  it("is silent during the lead-in (the riser plays) and after time is up", () => {
    expect(musicFor(snap({ phase: "question", qIndex: 0, secondsLeft: null }))).toBeNull();
    expect(musicFor(snap({ phase: "question", qIndex: 0, secondsLeft: 0 }))).toBeNull();
  });

  it("plays the countdown track while the answer timer runs, urgent in the last 5 seconds", () => {
    expect(musicFor(snap({ phase: "question", qIndex: 0, secondsLeft: 12 }))).toEqual({
      track: "question",
      double: false,
      urgent: false,
    });
    expect(musicFor(snap({ phase: "question", qIndex: 0, secondsLeft: 6 }))?.urgent).toBe(false);
    expect(musicFor(snap({ phase: "question", qIndex: 0, secondsLeft: 5 }))?.urgent).toBe(true);
    expect(musicFor(snap({ phase: "question", qIndex: 0, secondsLeft: 1 }))?.urgent).toBe(true);
  });

  it("uses the double-points flavour for double questions", () => {
    expect(musicFor(snap({ phase: "question", qIndex: 4, secondsLeft: 9, double: true }))).toEqual({
      track: "question",
      double: true,
      urgent: false,
    });
  });

  it("no loop on reveal, leaderboard and podium (stingers play there)", () => {
    expect(musicFor(snap({ phase: "reveal", qIndex: 0 }))).toBeNull();
    expect(musicFor(snap({ phase: "leaderboard", qIndex: 0 }))).toBeNull();
    expect(musicFor(snap({ phase: "ended", qIndex: 0 }))).toBeNull();
  });
});

describe("createJoinLimiter", () => {
  it("lets one pop through, then swallows pops that come too fast", () => {
    const allow = createJoinLimiter(0.15);
    expect(allow(10)).toBe(true);
    expect(allow(10.05)).toBe(false);
    expect(allow(10.1)).toBe(false);
    expect(allow(10.2)).toBe(true);
    expect(allow(10.3)).toBe(false);
    expect(allow(11)).toBe(true);
  });
});

describe("SOUNDS", () => {
  const end = (name: keyof typeof SOUNDS) =>
    Math.max(...SOUNDS[name].map((v) => v.at + v.dur + (v.release ?? 0)));

  it("every sound is audible, safely levelled and not endless", () => {
    for (const [name, voices] of Object.entries(SOUNDS)) {
      expect(voices.length, name).toBeGreaterThan(0);
      for (const v of voices) {
        if (v.src !== "noise") expect(v.f, name).toBeGreaterThan(20);
        expect(v.gain, name).toBeGreaterThan(0);
        expect(v.gain, name).toBeLessThanOrEqual(1);
        expect(v.at, name).toBeGreaterThanOrEqual(0);
        expect(v.dur, name).toBeGreaterThan(0);
      }
      expect(end(name as keyof typeof SOUNDS), name).toBeLessThanOrEqual(8);
    }
  });

  it("join pop and tick stay very short", () => {
    expect(end("join")).toBeLessThanOrEqual(0.3);
    expect(end("tick")).toBeLessThanOrEqual(0.2);
  });

  it("are layered: more than a single oscillator, with noise for the percussive ones", () => {
    for (const name of ["leadIn", "go", "reveal", "leaderboard", "fanfare"] as const) {
      expect(SOUNDS[name].length, name).toBeGreaterThanOrEqual(3);
      expect(
        SOUNDS[name].some((v) => v.src === "noise"),
        name,
      ).toBe(true);
    }
  });

  it("the lead-in riser fills the 3-second 'get ready' countdown", () => {
    expect(end("leadIn")).toBeGreaterThanOrEqual(2.4);
    expect(end("leadIn")).toBeLessThanOrEqual(3.2);
  });

  it("the podium fanfare is long, with a drum roll before the winner", () => {
    expect(end("fanfare")).toBeGreaterThanOrEqual(5);
    // the winner's block rises at ~2.6 s; the roll is many fast noise hits just before it
    const roll = SOUNDS.fanfare.filter((v) => v.src === "noise" && v.at >= 1.5 && v.at < 2.6 && v.dur < 0.2);
    expect(roll.length).toBeGreaterThanOrEqual(15);
    // multi-voice: several pitched voices sound together on the winner's hit
    const chord = SOUNDS.fanfare.filter((v) => v.src !== "noise" && Math.abs(v.at - 2.6) < 0.01);
    expect(new Set(chord.map((v) => v.f)).size).toBeGreaterThanOrEqual(3);
  });
});
