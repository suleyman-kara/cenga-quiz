/**
 * Stage (projector) sound, synthesised with Web Audio — no audio files, no licences.
 * soundCue() and musicFor() are pure: they decide which stinger a state transition deserves and
 * which music loop the current state wants. audioEngine.ts does the actual playing.
 */
import type { Phase } from "../../shared/types";
import {
  bell,
  brass,
  clap,
  crash,
  hat,
  hz,
  kick,
  shift,
  snare,
  stab,
  swoosh,
  tom,
  type Voice,
} from "./voices";

export type SoundName = "join" | "leadIn" | "go" | "tick" | "reveal" | "leaderboard" | "fanfare";

// ---------- stingers ----------

/** "Get ready" riser for the 3-second lead-in: 3·2·1 beeps over a swelling noise + saw sweep. */
const leadIn: Voice[] = [
  ...[0, 1, 2].flatMap((at, i) => [
    { src: "triangle", f: hz(81 + (i === 2 ? 5 : 0)), at, dur: 0.16, gain: 0.22, attack: 0.003 } as Voice,
    { src: "sine", f: hz(69 + (i === 2 ? 5 : 0)), at, dur: 0.2, gain: 0.18, attack: 0.003 } as Voice,
    ...shift(kick(0.55), at),
  ]),
  {
    src: "noise",
    at: 0,
    dur: 2.6,
    gain: 0.22,
    attack: 2.4,
    hold: true,
    release: 0.12,
    filter: { type: "bandpass", f: 350, to: 7000, q: 3 },
  },
  {
    src: "sawtooth",
    f: hz(45),
    to: hz(81),
    at: 0,
    dur: 2.6,
    gain: 0.07,
    attack: 2.3,
    hold: true,
    release: 0.1,
    filter: { type: "lowpass", f: 500, to: 5000, q: 6 },
  },
  {
    src: "sawtooth",
    f: hz(52),
    to: hz(88),
    detune: 8,
    at: 0,
    dur: 2.6,
    gain: 0.05,
    attack: 2.3,
    hold: true,
    release: 0.1,
    filter: { type: "lowpass", f: 500, to: 5000, q: 6 },
  },
];

/** Downbeat when the answer timer starts: kick + crash + a minor stab. */
const go: Voice[] = [...kick(1), ...crash(0.8, 1.3), ...stab([57, 60, 64, 69], 1.4)];

/** Wood-block tick for the last five seconds. */
const tick: Voice[] = [
  { src: "sine", f: 1650, at: 0, dur: 0.06, gain: 0.32, attack: 0.001 },
  { src: "sine", f: 2480, at: 0, dur: 0.035, gain: 0.12, attack: 0.001 },
  { src: "noise", at: 0, dur: 0.02, gain: 0.12, attack: 0.001, filter: { type: "bandpass", f: 3200, q: 2 } },
];

/** Bubble "pop" for a player joining. */
const join: Voice[] = [
  { src: "sine", f: 520, to: 1250, glide: 0.06, at: 0, dur: 0.13, gain: 0.32, attack: 0.002 },
  { src: "triangle", f: 1900, at: 0.035, dur: 0.06, gain: 0.07, attack: 0.002 },
  { src: "noise", at: 0, dur: 0.015, gain: 0.05, attack: 0.001, filter: { type: "bandpass", f: 2500, q: 2 } },
];

/** Bright major add9 chord with an opening filter, sparkle arpeggio and cymbal. */
const reveal: Voice[] = [
  ...kick(0.8),
  ...crash(0.55, 1.6),
  ...brass([60, 64, 67, 72, 74], 1.1, 1),
  { src: "sine", f: hz(48), at: 0, dur: 1.2, gain: 0.3, attack: 0.005 },
  ...[84, 88, 91, 96].flatMap((n, i) => shift(bell(n, 0.9), 0.06 + i * 0.07)),
];

/** Snare fill into a swoosh and a hit. */
const leaderboard: Voice[] = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => shift(snare(0.35 + i * 0.08), i * 0.055)),
  ...shift(tom(55, 0.8), 0.3),
  ...shift(tom(50, 0.9), 0.37),
  ...shift(tom(45, 1), 0.44),
  ...swoosh(0.55, 300, 6000, 0.22),
  ...shift(kick(1), 0.52),
  ...shift(crash(0.6, 1.2), 0.52),
  ...shift(brass([55, 62, 67], 0.35, 0.9), 0.52),
  { src: "sine", f: hz(43), at: 0.52, dur: 0.7, gain: 0.3, attack: 0.005 },
];

// Podium (see Podium.tsx / stage.css): 3rd rises at 0.3 s, 2nd at 1.4 s, the winner at 2.6 s.
const WIN = 2.6;
const roll: Voice[] = Array.from({ length: 22 }, (_, i) => {
  const at = 1.5 + i * 0.05;
  return shift(snare(0.18 + (i / 21) * 0.62), at).filter((v) => v.src === "noise");
}).flat();

const fanfare: Voice[] = [
  // third place
  ...shift(kick(0.8), 0.3),
  ...shift(brass([55, 59, 62], 0.35, 0.8), 0.3),
  // second place
  ...shift(kick(0.9), 1.4),
  ...shift(brass([57, 60, 65], 0.3, 0.9), 1.4),
  // drum roll + swell into the winner
  ...roll,
  ...shift(swoosh(1.1, 400, 8000, 0.14), 1.5),
  // the winner: big C major hit + trumpet line
  ...shift(kick(1), WIN),
  ...shift(crash(0.9, 2), WIN),
  ...shift(brass([48, 55, 60, 64, 67], 0.9, 1.1), WIN),
  ...(
    [
      [0, 67, 0.15],
      [0.18, 72, 0.15],
      [0.36, 76, 0.15],
      [0.54, 79, 0.42],
      [1.02, 76, 0.15],
      [1.2, 79, 1.1],
    ] as const
  ).flatMap(([at, n, d]) =>
    [-5, 5].map(
      (detune): Voice => ({
        src: "sawtooth",
        f: hz(n),
        detune,
        at: WIN + at,
        dur: d,
        gain: 0.075,
        attack: 0.02,
        hold: true,
        release: 0.1,
        filter: { type: "lowpass", f: 1500, to: 4500, q: 1.2 },
      }),
    ),
  ),
  ...shift(snare(0.6), WIN + 0.54),
  ...shift(brass([53, 57, 60, 65], 0.45, 0.9), WIN + 1.0),
  ...shift(kick(0.9), WIN + 1.0),
  ...shift(brass([55, 59, 62, 67], 0.45, 0.95), WIN + 1.5),
  ...shift(kick(0.9), WIN + 1.5),
  ...shift(clap(0.7), WIN + 1.5),
  // final chord, ringing out
  ...shift(kick(1), WIN + 2.0),
  ...shift(crash(0.9, 2.2), WIN + 2.0),
  ...shift(brass([48, 55, 60, 64, 67, 72], 1.6, 1.1), WIN + 2.0),
  { src: "sine", f: hz(36), at: WIN + 2.0, dur: 2, gain: 0.3, attack: 0.01 },
  ...[84, 88, 91, 96, 100].flatMap((n, i) => shift(bell(n, 0.7, 0.9), WIN + 2.05 + i * 0.08)),
  ...shift(hat(0.6, true), WIN + 2.5),
];

export const SOUNDS: Record<SoundName, Voice[]> = { join, leadIn, go, tick, reveal, leaderboard, fanfare };

// ---------- decisions ----------

export interface StageSnapshot {
  phase: Phase;
  qIndex: number;
  players: number;
  /** whole seconds left while the answer timer runs; null outside it (incl. the lead-in) */
  secondsLeft: number | null;
  /** double-points question */
  double?: boolean;
}

const TICK_FROM = 5;

export function soundCue(prev: StageSnapshot | null, next: StageSnapshot): SoundName[] {
  if (!prev) return []; // never on page load / reload
  const phaseChanged = prev.phase !== next.phase || prev.qIndex !== next.qIndex;
  if (phaseChanged) {
    switch (next.phase) {
      case "question":
        // normally the 3 s lead-in is on; if it was missed, go straight to the downbeat
        return [next.secondsLeft === null ? "leadIn" : "go"];
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
  if (next.phase === "question" && prev.secondsLeft === null && next.secondsLeft !== null && next.secondsLeft > 0) {
    return ["go"];
  }
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

export type TrackId = "lobby" | "question";

export interface MusicState {
  track: TrackId;
  double: boolean;
  /** last seconds of the answer timer: faster and busier */
  urgent: boolean;
}

/** Which loop (if any) the stage should be playing right now. Unlike cues, also on reload. */
export function musicFor(s: StageSnapshot): MusicState | null {
  if (s.phase === "lobby") return { track: "lobby", double: false, urgent: false };
  if (s.phase === "question" && s.secondsLeft !== null && s.secondsLeft > 0) {
    return { track: "question", double: !!s.double, urgent: s.secondsLeft <= TICK_FROM };
  }
  return null;
}

/** Allows one join pop per `gap` seconds; extra joins in a burst are swallowed. */
export function createJoinLimiter(gap = 0.15): (now: number) => boolean {
  let last = -Infinity;
  return (now) => {
    if (now - last < gap) return false;
    last = now;
    return true;
  };
}
