import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStageAudio } from "./audioEngine";
import { FakeAudioContext } from "../test/fakeAudio";

const ctxOf = () => FakeAudioContext.instances[FakeAudioContext.instances.length - 1];
const advance = (ctx: FakeAudioContext, seconds: number) => {
  for (let i = 0; i < seconds / 0.025; i++) {
    ctx.currentTime += 0.025;
    vi.advanceTimersByTime(25);
  }
};

describe("createStageAudio", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudioContext.reset();
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does nothing (and never throws) where Web Audio is unavailable", () => {
    vi.stubGlobal("AudioContext", undefined);
    const a = createStageAudio();
    expect(a.available).toBe(false);
    expect(a.blocked()).toBe(false);
    expect(() => {
      a.unlock();
      a.play("fanfare");
      a.setMusic({ track: "lobby", double: false, urgent: false });
      a.setLevels(0.5, 0.5);
      a.setMuted(true);
      a.dispose();
    }).not.toThrow();
  });

  it("does not throw when the browser refuses to create a context", () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("no audio device");
        }
      },
    );
    const a = createStageAudio();
    expect(a.available).toBe(false);
    expect(() => a.play("reveal")).not.toThrow();
  });

  it("builds a master chain with a compressor/limiter and a reverb", () => {
    createStageAudio();
    const kinds = ctxOf().nodes.map((n) => n.kind);
    expect(kinds.filter((k) => k === "compressor").length).toBeGreaterThanOrEqual(1);
    expect(kinds.some((k) => k === "convolver" || k === "delay")).toBe(true);
  });

  it("plays layered effects only while the context runs", () => {
    FakeAudioContext.initialState = "suspended";
    FakeAudioContext.gestureSeen = false;
    const a = createStageAudio();
    expect(a.blocked()).toBe(true);
    a.play("reveal");
    expect(ctxOf().started).toHaveLength(0);
    FakeAudioContext.gestureSeen = true;
    a.unlock();
    expect(a.blocked()).toBe(false);
    a.play("reveal");
    expect(ctxOf().started.length).toBeGreaterThanOrEqual(4);
    expect(ctxOf().started.some((s) => s.kind === "buffer")).toBe(true); // filtered noise layer
  });

  it("tells listeners when the context gets unlocked", () => {
    FakeAudioContext.initialState = "suspended";
    FakeAudioContext.gestureSeen = true;
    const a = createStageAudio();
    const cb = vi.fn();
    a.onChange(cb);
    a.unlock();
    expect(cb).toHaveBeenCalled();
  });

  it("rate-limits join pops when many players join at once", () => {
    const a = createStageAudio();
    const ctx = ctxOf();
    a.play("join");
    const one = ctx.started.length;
    expect(one).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) a.play("join");
    expect(ctx.started.length).toBe(one);
    ctx.currentTime += 1;
    a.play("join");
    expect(ctx.started.length).toBe(2 * one);
  });

  it("schedules music ahead on the audio clock while a track is set", () => {
    const a = createStageAudio();
    const ctx = ctxOf();
    a.setMusic({ track: "lobby", double: false, urgent: false });
    advance(ctx, 2);
    const n = ctx.started.length;
    expect(n).toBeGreaterThan(10);
    // every note was scheduled for "now or later", never in the past
    for (const s of ctx.started) expect(s.at).toBeGreaterThanOrEqual(0);
    a.setMusic(null);
    advance(ctx, 2);
    // nothing new after stopping (beyond what was already queued ahead)
    expect(ctx.started.filter((s) => s.at > 2.3)).toHaveLength(0);
  });

  it("never stacks two loops: the same track keeps playing, a new one replaces the old", () => {
    const a = createStageAudio();
    const ctx = ctxOf();
    a.setMusic({ track: "lobby", double: false, urgent: false });
    a.setMusic({ track: "lobby", double: false, urgent: false });
    expect(a.debug().tracksStarted).toBe(1);
    advance(ctx, 1);
    a.setMusic({ track: "question", double: false, urgent: false });
    expect(a.debug().tracksStarted).toBe(2);
    expect(a.debug().activeTracks).toBe(1);
    expect(a.debug().music).toBe("question");
    // urgent only changes the running loop
    a.setMusic({ track: "question", double: false, urgent: true });
    expect(a.debug().tracksStarted).toBe(2);
    // double points is another flavour → a new loop (crossfaded)
    a.setMusic({ track: "question", double: true, urgent: false });
    expect(a.debug().tracksStarted).toBe(3);
    expect(a.debug().activeTracks).toBe(1);
  });

  it("does not schedule music while audio is blocked, and starts it once unlocked", () => {
    FakeAudioContext.initialState = "suspended";
    FakeAudioContext.gestureSeen = false;
    const a = createStageAudio();
    const ctx = ctxOf();
    a.setMusic({ track: "lobby", double: false, urgent: false });
    advance(ctx, 1);
    expect(ctx.started).toHaveLength(0);
    FakeAudioContext.gestureSeen = true;
    a.unlock();
    advance(ctx, 1);
    expect(ctx.started.length).toBeGreaterThan(0);
    for (const s of ctx.started) expect(s.at).toBeGreaterThanOrEqual(1);
  });

  it("mute fades the master out; levels go to separate music and effects buses", () => {
    const a = createStageAudio();
    const gains = ctxOf()
      .nodes.filter((n) => n.kind === "gain")
      .map((n) => (n as unknown as { gain: { value: number } }).gain);
    a.setLevels(0.3, 0.9);
    const values = gains.map((g) => g.value);
    expect(values.some((v) => Math.abs(v - 0.3) < 1e-6)).toBe(true);
    expect(values.some((v) => Math.abs(v - 0.9) < 1e-6)).toBe(true);
    a.setMuted(true);
    expect(gains.some((g) => g.value === 0)).toBe(true);
  });

  it("dispose stops the scheduler and closes the context", () => {
    const a = createStageAudio();
    const ctx = ctxOf();
    a.setMusic({ track: "lobby", double: false, urgent: false });
    a.dispose();
    expect(ctx.state).toBe("closed");
    const n = ctx.started.length;
    advance(ctx, 1);
    expect(ctx.started.length).toBe(n);
  });
});
