import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStageSounds } from "./useStageSounds";
import type { StageSnapshot } from "./sound";

const created = vi.fn();

class FakeParam {
  value = 0;
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}
class FakeNode {
  connect(n: unknown) {
    return n;
  }
}
class FakeAudioContext {
  state: AudioContextState;
  currentTime = 0;
  destination = new FakeNode();
  constructor() {
    this.state = FakeAudioContext.initialState;
  }
  static initialState: AudioContextState = "running";
  /** like a browser: resume() only works once the page has had a user gesture */
  static gestureSeen = true;
  resume() {
    if (FakeAudioContext.gestureSeen) this.state = "running";
    return Promise.resolve();
  }
  createOscillator() {
    created();
    return Object.assign(new FakeNode(), { type: "sine", frequency: new FakeParam(), start() {}, stop() {} });
  }
  createGain() {
    return Object.assign(new FakeNode(), { gain: new FakeParam() });
  }
}

const lobby = (players: number): StageSnapshot => ({ phase: "lobby", qIndex: -1, players, secondsLeft: null });

describe("useStageSounds", () => {
  beforeEach(() => {
    created.mockClear();
    FakeAudioContext.initialState = "running";
    FakeAudioContext.gestureSeen = true;
    vi.stubGlobal("AudioContext", FakeAudioContext);
    localStorage.removeItem("stage-sound-muted");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays without a click on this screen when the browser already allows audio", () => {
    const { rerender } = renderHook((s: StageSnapshot) => useStageSounds(s), { initialProps: lobby(0) });
    rerender(lobby(1));
    expect(created).toHaveBeenCalled();
  });

  it("stays silent while audio is blocked, and works after the first click", () => {
    FakeAudioContext.initialState = "suspended";
    FakeAudioContext.gestureSeen = false;
    const { rerender } = renderHook((s: StageSnapshot) => useStageSounds(s), { initialProps: lobby(0) });
    rerender(lobby(1));
    expect(created).not.toHaveBeenCalled();
    FakeAudioContext.gestureSeen = true;
    document.dispatchEvent(new Event("pointerdown"));
    return Promise.resolve().then(() => {
      rerender(lobby(2));
      expect(created).toHaveBeenCalled();
    });
  });

  it("is silent when muted", () => {
    localStorage.setItem("stage-sound-muted", "1");
    const { rerender } = renderHook((s: StageSnapshot) => useStageSounds(s), { initialProps: lobby(0) });
    rerender(lobby(1));
    expect(created).not.toHaveBeenCalled();
    localStorage.removeItem("stage-sound-muted");
  });
});
