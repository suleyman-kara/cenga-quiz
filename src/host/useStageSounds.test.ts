import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useStageSounds } from "./useStageSounds";
import type { StageSnapshot } from "./sound";
import { FakeAudioContext } from "../test/fakeAudio";

const lobby = (players: number): StageSnapshot => ({ phase: "lobby", qIndex: -1, players, secondsLeft: null });
const reveal = (): StageSnapshot => ({ phase: "reveal", qIndex: 0, players: 3, secondsLeft: null });
const ctx = () => FakeAudioContext.instances[FakeAudioContext.instances.length - 1];
const started = () => FakeAudioContext.instances.reduce((n, c) => n + c.started.length, 0);

describe("useStageSounds", () => {
  beforeEach(() => {
    FakeAudioContext.reset();
    vi.stubGlobal("AudioContext", FakeAudioContext);
    localStorage.removeItem("stage-sound-muted");
    localStorage.removeItem("stage-sound-levels");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays without a click on this screen when the browser already allows audio", () => {
    const { rerender } = renderHook((s: StageSnapshot) => useStageSounds(s), { initialProps: reveal() });
    rerender({ ...reveal(), phase: "leaderboard" });
    expect(started()).toBeGreaterThan(0);
  });

  it("stays silent while audio is blocked, and works after the first click", async () => {
    FakeAudioContext.initialState = "suspended";
    FakeAudioContext.gestureSeen = false;
    const { result, rerender } = renderHook((s: StageSnapshot) => useStageSounds(s), { initialProps: lobby(0) });
    rerender(lobby(1));
    expect(started()).toBe(0);
    expect(result.current.off).toBe(true);
    FakeAudioContext.gestureSeen = true;
    await act(async () => {
      document.dispatchEvent(new Event("pointerdown"));
      await Promise.resolve();
    });
    expect(result.current.off).toBe(false);
    rerender(lobby(2));
    expect(started()).toBeGreaterThan(0);
  });

  it("is silent when muted", () => {
    localStorage.setItem("stage-sound-muted", "1");
    const { result, rerender } = renderHook((s: StageSnapshot) => useStageSounds(s), { initialProps: lobby(0) });
    rerender(lobby(1));
    expect(started()).toBe(0);
    expect(result.current.off).toBe(true);
  });

  it("enable() unmutes and unlocks (the 'sound is off' banner)", async () => {
    localStorage.setItem("stage-sound-muted", "1");
    FakeAudioContext.initialState = "suspended";
    const { result } = renderHook((s: StageSnapshot) => useStageSounds(s), { initialProps: lobby(0) });
    expect(result.current.off).toBe(true);
    await act(async () => {
      result.current.enable();
      await Promise.resolve();
    });
    expect(result.current.muted).toBe(false);
    expect(result.current.off).toBe(false);
    expect(localStorage.getItem("stage-sound-muted")).toBeNull();
  });

  it("'off' is false where Web Audio does not exist (nothing to turn on)", () => {
    vi.stubGlobal("AudioContext", undefined);
    const { result } = renderHook((s: StageSnapshot) => useStageSounds(s), { initialProps: lobby(0) });
    expect(result.current.off).toBe(false);
  });

  it("has separate music and effects levels with sensible defaults, remembered per browser", () => {
    const { result, unmount } = renderHook((s: StageSnapshot) => useStageSounds(s), { initialProps: lobby(0) });
    expect(result.current.musicLevel).toBeLessThan(result.current.sfxLevel);
    expect(result.current.musicLevel).toBeGreaterThan(0);
    act(() => result.current.setMusicLevel(0.25));
    act(() => result.current.setSfxLevel(0.5));
    expect(JSON.parse(localStorage.getItem("stage-sound-levels") ?? "{}")).toEqual({ music: 0.25, sfx: 0.5 });
    unmount();
    const again = renderHook((s: StageSnapshot) => useStageSounds(s), { initialProps: lobby(0) });
    expect(again.result.current.musicLevel).toBe(0.25);
    expect(again.result.current.sfxLevel).toBe(0.5);
  });

  it("ignores broken stored levels", () => {
    localStorage.setItem("stage-sound-levels", "{oops");
    const { result } = renderHook((s: StageSnapshot) => useStageSounds(s), { initialProps: lobby(0) });
    expect(result.current.musicLevel).toBeGreaterThan(0);
    localStorage.setItem("stage-sound-levels", JSON.stringify({ music: 7, sfx: "x" }));
    const r2 = renderHook((s: StageSnapshot) => useStageSounds(s), { initialProps: lobby(0) });
    expect(r2.result.current.musicLevel).toBeLessThanOrEqual(1);
    expect(r2.result.current.sfxLevel).toBeGreaterThan(0);
  });

  it("closes its audio context on unmount", () => {
    const { unmount } = renderHook((s: StageSnapshot) => useStageSounds(s), { initialProps: lobby(0) });
    const c = ctx();
    unmount();
    expect(c.state).toBe("closed");
  });
});
