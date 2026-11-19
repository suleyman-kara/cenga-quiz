/**
 * Stage (projector) sound effects, synthesised with Web Audio — no audio files, no licences.
 * soundCue() is pure: it decides which sounds a state transition deserves.
 */
import type { Phase } from "../../shared/types";

export type SoundName = "join" | "question" | "tick" | "reveal" | "leaderboard" | "fanfare";

export interface Tone {
  /** frequency (Hz) */
  f: number;
  /** start offset (s) */
  at: number;
  /** duration (s) */
  dur: number;
  type?: OscillatorType;
  /** peak gain, 0..1 (kept low: projector speakers are loud) */
  gain?: number;
}

// note frequencies (Hz)
const A4 = 440;
const B4 = 493.88;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const F5 = 698.46;
const G5 = 783.99;
const C6 = 1046.5;

export const SOUNDS: Record<SoundName, Tone[]> = {
  join: [{ f: 880, at: 0, dur: 0.08, type: "triangle", gain: 0.12 }],
  question: [
    { f: C5, at: 0, dur: 0.14, type: "triangle", gain: 0.18 },
    { f: E5, at: 0.11, dur: 0.14, type: "triangle", gain: 0.18 },
    { f: G5, at: 0.22, dur: 0.24, type: "triangle", gain: 0.2 },
  ],
  tick: [{ f: 1200, at: 0, dur: 0.05, type: "square", gain: 0.06 }],
  reveal: [
    { f: C5, at: 0, dur: 0.5, type: "sine", gain: 0.16 },
    { f: E5, at: 0, dur: 0.5, type: "sine", gain: 0.14 },
    { f: G5, at: 0, dur: 0.5, type: "sine", gain: 0.14 },
    { f: C6, at: 0.08, dur: 0.45, type: "triangle", gain: 0.1 },
  ],
  leaderboard: [
    { f: A4, at: 0, dur: 0.12, type: "triangle", gain: 0.14 },
    { f: D5, at: 0.1, dur: 0.12, type: "triangle", gain: 0.14 },
    { f: F5, at: 0.2, dur: 0.22, type: "triangle", gain: 0.16 },
  ],
  fanfare: [
    { f: G5 / 2, at: 0, dur: 0.18, type: "sawtooth", gain: 0.08 },
    { f: C5, at: 0.18, dur: 0.18, type: "triangle", gain: 0.18 },
    { f: E5, at: 0.36, dur: 0.18, type: "triangle", gain: 0.18 },
    { f: G5, at: 0.54, dur: 0.3, type: "triangle", gain: 0.2 },
    { f: B4, at: 0.9, dur: 0.9, type: "sine", gain: 0.12 },
    { f: E5, at: 0.9, dur: 0.9, type: "sine", gain: 0.12 },
    { f: C6, at: 0.9, dur: 1.1, type: "triangle", gain: 0.16 },
  ],
};

export interface StageSnapshot {
  phase: Phase;
  qIndex: number;
  players: number;
  /** whole seconds left while the answer timer runs; null outside it (incl. the lead-in) */
  secondsLeft: number | null;
}

const TICK_FROM = 5;

export function soundCue(prev: StageSnapshot | null, next: StageSnapshot): SoundName[] {
  if (!prev) return []; // never on page load / reload
  const phaseChanged = prev.phase !== next.phase || prev.qIndex !== next.qIndex;
  if (phaseChanged) {
    switch (next.phase) {
      case "question":
        return ["question"];
      case "reveal":
        return ["reveal"];
      case "leaderboard":
        return ["leaderboard"];
      case "ended":
        return ["fanfare"];
      default:
        return [];
    }
  }
  if (next.phase === "lobby" && next.players > prev.players) return ["join"];
  if (
    next.phase === "question" &&
    next.secondsLeft !== null &&
    next.secondsLeft > 0 &&
    next.secondsLeft <= TICK_FROM &&
    (prev.secondsLeft === null || next.secondsLeft < prev.secondsLeft)
  ) {
    return ["tick"];
  }
  return [];
}

type AudioCtor = typeof AudioContext;

/** Plays SOUNDS through one shared AudioContext. No-op where Web Audio is unavailable. */
export function createSoundPlayer(): { play: (name: SoundName) => void; unlock: () => void } {
  let ctx: AudioContext | null = null;
  const get = (): AudioContext | null => {
    if (ctx) return ctx;
    if (typeof window === "undefined") return null;
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      ctx = null;
    }
    return ctx;
  };
  return {
    // Browsers only allow audio after a user gesture; call this from one (any click / key).
    unlock: () => {
      const c = get();
      if (c && c.state === "suspended") void c.resume().catch(() => undefined);
    },
    play: (name) => {
      const c = get();
      if (!c || c.state !== "running") return;
      const t0 = c.currentTime + 0.01;
      for (const tone of SOUNDS[name]) {
        const osc = c.createOscillator();
        const amp = c.createGain();
        osc.type = tone.type ?? "sine";
        osc.frequency.value = tone.f;
        const start = t0 + tone.at;
        const end = start + tone.dur;
        const peak = tone.gain ?? 0.2;
        amp.gain.setValueAtTime(0.0001, start);
        amp.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.02, tone.dur / 4));
        amp.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(amp).connect(c.destination);
        osc.start(start);
        osc.stop(end + 0.02);
      }
    },
  };
}
