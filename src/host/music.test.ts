import { describe, it, expect } from "vitest";
import { INSTRUMENTS, createSequencer, getTrack, type ScheduledNote, type Track } from "./music";

const allEvents = (track: ReturnType<typeof getTrack>, urgent: boolean) =>
  Array.from({ length: track.steps }, (_, s) => track.events(s, urgent)).flat();

describe("music tracks", () => {
  it("lobby: a cheerful ~120 BPM loop of 8–16 bars with a four-on-the-floor kick", () => {
    const lobby = getTrack("lobby", false);
    expect(lobby.bpm).toBeGreaterThanOrEqual(110);
    expect(lobby.bpm).toBeLessThanOrEqual(130);
    expect(lobby.steps % 16).toBe(0);
    expect(lobby.steps / 16).toBeGreaterThanOrEqual(8);
    expect(lobby.steps / 16).toBeLessThanOrEqual(16);
    for (let bar = 0; bar < lobby.steps / 16; bar++) {
      for (const beat of [0, 4, 8, 12]) {
        expect(lobby.events(bar * 16 + beat, false).some((e) => e.inst === "kick"), `bar ${bar} beat ${beat}`).toBe(
          true,
        );
      }
    }
    const used = new Set(allEvents(lobby, false).map((e) => e.inst));
    for (const inst of ["kick", "snare", "hat", "bass", "lead", "pluck"] as const) expect(used.has(inst), inst).toBe(true);
  });

  it("every event uses a known instrument, sane notes and velocities", () => {
    for (const track of [getTrack("lobby", false), getTrack("question", false), getTrack("question", true)]) {
      for (const urgent of [false, true]) {
        for (const e of allEvents(track, urgent)) {
          expect(INSTRUMENTS).toContain(e.inst);
          for (const n of [e.note, ...(e.notes ?? [])]) {
            if (n === undefined) continue;
            expect(n).toBeGreaterThanOrEqual(24);
            expect(n).toBeLessThanOrEqual(108);
          }
          expect(e.vel ?? 1).toBeGreaterThan(0);
          expect(e.vel ?? 1).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("question: speeds up and gets busier in the last seconds", () => {
    const q = getTrack("question", false);
    expect(q.urgentBpm).toBeGreaterThan(q.bpm);
    expect(allEvents(q, true).length).toBeGreaterThan(allEvents(q, false).length);
  });

  it("question: has a driving bass pulse and a rising arpeggio", () => {
    const q = getTrack("question", false);
    const bar0 = Array.from({ length: 16 }, (_, s) => q.events(s, false)).flat();
    expect(bar0.filter((e) => e.inst === "bass").length).toBeGreaterThanOrEqual(8);
    const arpTop = (bar: number) =>
      Math.max(
        ...Array.from({ length: 16 }, (_, s) => q.events(bar * 16 + s, false))
          .flat()
          .filter((e) => e.inst === "pluck")
          .map((e) => e.note ?? 0),
      );
    expect(arpTop(q.steps / 16 - 1)).toBeGreaterThan(arpTop(0));
  });

  it("double points: a different key and flavour", () => {
    const plain = allEvents(getTrack("question", false), false);
    const dbl = allEvents(getTrack("question", true), false);
    const bassNotes = (evs: typeof plain) => evs.filter((e) => e.inst === "bass").map((e) => e.note);
    expect(bassNotes(dbl)).not.toEqual(bassNotes(plain));
    expect(dbl.some((e) => e.inst === "stab")).toBe(true);
    expect(plain.some((e) => e.inst === "stab")).toBe(false);
  });
});

describe("createSequencer (lookahead scheduler on the audio clock)", () => {
  const collect = () => {
    const out: ScheduledNote[] = [];
    return { out, emit: (n: ScheduledNote) => out.push(n) };
  };
  const lobby = getTrack("lobby", false);
  const stepDur = 60 / lobby.bpm / 4;
  /** a metronome: one hat on every step, so every scheduled step is visible */
  const every: Track = { id: "lobby", bpm: 120, urgentBpm: 120, steps: 16, events: () => [{ inst: "hat" }] };

  it("schedules steps on exact clock times, only within the lookahead window", () => {
    const { out, emit } = collect();
    const seq = createSequencer(every, 1, emit);
    seq.pump(1, 0.1);
    const steps = [...new Set(out.map((n) => n.step))];
    expect(steps).toEqual([0]); // 1 + 0.125 > 1.1
    seq.pump(1.05, 0.1);
    seq.pump(1.2, 0.1);
    const times = [...new Set(out.map((n) => n.time))];
    expect(times).toEqual([1, 1 + stepDur, 1 + 2 * stepDur]);
    for (const n of out) expect(n.stepDur).toBeCloseTo(stepDur);
  });

  it("never schedules a step twice when pumped often", () => {
    const { out, emit } = collect();
    const seq = createSequencer(lobby, 0, emit);
    for (let t = 0; t < 2; t += 0.025) seq.pump(t, 0.1);
    const steps = out.filter((n) => n.ev.inst === "kick").map((n) => n.step);
    expect(new Set(steps).size).toBe(steps.length);
    expect(steps).toEqual([0, 4, 8, 12, 16]); // 2 s at 120 BPM + the step just inside the lookahead
  });

  it("wraps around the loop", () => {
    const { out, emit } = collect();
    const seq = createSequencer(lobby, 0, emit);
    const loopDur = lobby.steps * stepDur;
    for (let t = 0; t < loopDur + 0.3; t += 0.05) seq.pump(t, 0.1);
    expect(out.some((n) => n.step === 0 && n.time > loopDur - 0.01)).toBe(true);
    expect(Math.max(...out.map((n) => n.step))).toBe(lobby.steps - 1);
  });

  it("a tempo change (urgent) applies from the next step without a gap or jump", () => {
    const q = getTrack("question", false);
    const { out, emit } = collect();
    const seq = createSequencer(q, 0, emit);
    seq.pump(0, 0.2);
    const lastBefore = Math.max(...out.map((n) => n.time));
    seq.setUrgent(true);
    expect(seq.urgent).toBe(true);
    seq.pump(0.2, 0.3);
    const times = [...new Set(out.map((n) => n.time))].sort((a, b) => a - b);
    const after = times.filter((t) => t > lastBefore);
    const fast = 60 / q.urgentBpm / 4;
    expect(after[0] - lastBefore).toBeCloseTo(60 / q.bpm / 4);
    expect(after[1] - after[0]).toBeCloseTo(fast);
  });

  it("after the tab was frozen it skips missed steps instead of bursting them out", () => {
    const { out, emit } = collect();
    const seq = createSequencer(every, 0, emit);
    seq.pump(0, 0.1);
    out.length = 0;
    seq.pump(30, 0.1);
    expect(out.length).toBeGreaterThan(0);
    for (const n of out) expect(n.time).toBeGreaterThanOrEqual(30);
    expect(new Set(out.map((n) => n.step)).size).toBeLessThanOrEqual(2);
  });
});
