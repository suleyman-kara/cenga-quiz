/**
 * Synthesised background music: step-sequenced loops (16th-note grid) and a lookahead scheduler.
 * Everything here is pure; audioEngine.ts drives createSequencer() from the AudioContext clock.
 */
import type { TrackId } from "./sound";
import { bass, clap, crash, hat, kick, lead, pad, pluck, snare, stab, type Voice } from "./voices";

export const INSTRUMENTS = [
  "kick",
  "snare",
  "clap",
  "hat",
  "openHat",
  "crash",
  "bass",
  "pluck",
  "lead",
  "pad",
  "stab",
] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export interface NoteEvent {
  inst: Instrument;
  /** MIDI note (pitched instruments) */
  note?: number;
  /** chord notes (pad, stab) */
  notes?: number[];
  /** length in steps (16th notes) */
  len?: number;
  /** 0..1 */
  vel?: number;
}

export interface Track {
  id: TrackId;
  bpm: number;
  /** tempo in the last seconds (question track) */
  urgentBpm: number;
  /** loop length in 16th-note steps */
  steps: number;
  events(step: number, urgent: boolean): NoteEvent[];
}

const up = (notes: number[], n: number) => notes.map((x) => x + n);

// ---------- lobby: cheerful, 120 BPM, C major, 8 bars (groove, then the hook) ----------

const C = [60, 64, 67];
const Am = [57, 60, 64];
const F = [57, 60, 65];
const G = [55, 59, 62];
const LOBBY_CHORDS = [C, Am, F, G, C, Am, F, G];
const LOBBY_ROOTS = [48, 45, 41, 43, 48, 45, 41, 43];

// [step in bar, MIDI, length in steps] — played in bars 4-7
const HOOK: [number, number, number][][] = [
  [
    [0, 72, 2],
    [2, 76, 2],
    [4, 79, 4],
    [10, 76, 2],
    [12, 74, 4],
  ],
  [
    [0, 72, 4],
    [6, 69, 2],
    [8, 72, 2],
    [12, 76, 4],
  ],
  [
    [0, 77, 3],
    [4, 76, 2],
    [6, 74, 2],
    [8, 72, 4],
    [12, 69, 4],
  ],
  [
    [0, 71, 4],
    [4, 74, 4],
    [8, 79, 8],
  ],
];

const lobby: Track = {
  id: "lobby",
  bpm: 120,
  urgentBpm: 120,
  steps: 128,
  events(step) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = LOBBY_CHORDS[bar];
    const root = LOBBY_ROOTS[bar];
    const second = bar >= 4;
    const ev: NoteEvent[] = [];
    if (s % 4 === 0) ev.push({ inst: "kick", vel: s === 0 ? 1 : 0.85 });
    if (s === 4 || s === 12) ev.push({ inst: "clap", vel: 0.8 });
    if (s % 4 === 2) ev.push({ inst: s === 14 && bar % 2 === 1 ? "openHat" : "hat", vel: 0.75 });
    else if (second && s % 2 === 1) ev.push({ inst: "hat", vel: 0.3 });
    if (s === 0 && bar % 4 === 0) ev.push({ inst: "crash", vel: 0.5 });
    if (bar === 7 && s >= 12) ev.push({ inst: "snare", vel: 0.45 + (s - 12) * 0.15 });
    if (s % 2 === 0) ev.push({ inst: "bass", note: root + (s % 4 === 2 ? 12 : 0), len: 2, vel: s % 4 === 0 ? 1 : 0.75 });
    if (s === 0) ev.push({ inst: "pad", notes: chord, len: 16, vel: second ? 0.7 : 1 });
    const arp = [0, 1, 2, 1];
    if (second || s % 2 === 0) {
      const i = second ? s % 4 : (s / 2) % 4;
      ev.push({ inst: "pluck", note: chord[arp[i]] + 12, vel: second ? 0.5 : 0.75 });
    }
    if (second) {
      for (const [at, note, len] of HOOK[bar - 4]) if (at === s) ev.push({ inst: "lead", note, len, vel: 1 });
    }
    return ev;
  },
};

// ---------- question: tense, A minor (double: D minor + stabs), driving pulse + rising arp ----------

const Q_CHORDS = [
  [57, 60, 64],
  [57, 60, 64],
  [53, 57, 60],
  [52, 56, 59],
];
const Q_ROOTS = [45, 45, 41, 40];

function questionTrack(double: boolean): Track {
  const key = double ? 5 : 0;
  return {
    id: "question",
    bpm: double ? 134 : 128,
    urgentBpm: double ? 160 : 152,
    steps: 64,
    events(step, urgent) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const chord = up(Q_CHORDS[bar], key);
      const root = Q_ROOTS[bar] + key;
      const ev: NoteEvent[] = [];
      if (s % 4 === 0 || (urgent && s === 14)) ev.push({ inst: "kick", vel: s % 4 === 0 ? 1 : 0.7 });
      if (s === 12 || (urgent && s === 4)) ev.push({ inst: "clap", vel: 0.75 });
      if (urgent) {
        ev.push({ inst: s === 14 ? "openHat" : "hat", vel: s % 2 === 0 ? 0.85 : 0.45 });
        if (bar === 3 && s >= 8 && s % 2 === 0) ev.push({ inst: "snare", vel: 0.4 + (s - 8) * 0.08 });
      } else if (s % 4 === 2) ev.push({ inst: "hat", vel: 0.7 });
      else if (s % 2 === 1) ev.push({ inst: "hat", vel: 0.25 });
      // driving 16th bass pulse
      const accent = [1, 0.45, 0.65, 0.45][s % 4];
      ev.push({ inst: "bass", note: root + (s % 8 === 6 ? 12 : 0), len: 1, vel: accent * (urgent ? 1 : 0.85) });
      // arpeggio that climbs: up the chord inside each beat, an octave higher in the second half
      const tones = [chord[0], chord[1], chord[2], chord[0] + 12];
      ev.push({ inst: "pluck", note: tones[s % 4] + 12 + (bar >= 2 ? 12 : 0), vel: urgent ? 0.9 : 0.55 });
      if (s === 0) ev.push({ inst: "pad", notes: chord, len: 16, vel: 0.6 });
      if (s === 0 && bar === 0) ev.push({ inst: "crash", vel: 0.35 });
      if (double && (s === 0 || s === 3 || s === 6 || (urgent && s === 10))) {
        ev.push({ inst: "stab", notes: up(chord, 12), vel: 0.9 });
      }
      return ev;
    },
  };
}

const TRACKS = {
  lobby,
  question: questionTrack(false),
  questionDouble: questionTrack(true),
};

export function getTrack(id: TrackId, double: boolean): Track {
  if (id === "lobby") return TRACKS.lobby;
  return double ? TRACKS.questionDouble : TRACKS.question;
}

/** Turns a note event into synth voices (times relative to the step). */
export function noteVoices(ev: NoteEvent, stepDur: number): Voice[] {
  const vel = ev.vel ?? 1;
  const len = (ev.len ?? 1) * stepDur;
  switch (ev.inst) {
    case "kick":
      return kick(vel);
    case "snare":
      return snare(vel);
    case "clap":
      return clap(vel);
    case "hat":
      return hat(vel);
    case "openHat":
      return hat(vel, true);
    case "crash":
      return crash(vel);
    case "bass":
      return bass(ev.note ?? 45, len * 0.9, vel);
    case "pluck":
      return pluck(ev.note ?? 69, vel);
    case "lead":
      return lead(ev.note ?? 72, len * 0.92, vel);
    case "pad":
      return pad(ev.notes ?? [], len, vel);
    case "stab":
      return stab(ev.notes ?? [], vel);
  }
}

// ---------- scheduler ----------

export interface ScheduledNote {
  ev: NoteEvent;
  /** AudioContext time the note starts */
  time: number;
  step: number;
  stepDur: number;
}

/** More than this behind the clock (tab frozen / throttled): restart from "now". */
const MAX_LAG = 0.3;

/**
 * Lookahead scheduler ("two clocks"): a coarse timer calls pump(now, ahead) often; every step
 * whose start falls before now + ahead is emitted with its exact audio-clock time, so note timing
 * never depends on timer jitter. Steps are emitted once; missed steps are skipped, never bursted.
 */
export function createSequencer(track: Track, startAt: number, emit: (n: ScheduledNote) => void) {
  let step = 0;
  let next = startAt;
  let urgent = false;
  const stepDur = () => 60 / (urgent ? track.urgentBpm : track.bpm) / 4;
  return {
    get urgent() {
      return urgent;
    },
    setUrgent(u: boolean) {
      urgent = u;
    },
    pump(now: number, ahead: number) {
      if (next < now - MAX_LAG) next = now;
      while (next < now) {
        step = (step + 1) % track.steps;
        next += stepDur();
      }
      while (next < now + ahead) {
        const d = stepDur();
        for (const ev of track.events(step, urgent)) emit({ ev, time: next, step, stepDur: d });
        step = (step + 1) % track.steps;
        next += d;
      }
    },
  };
}
export type Sequencer = ReturnType<typeof createSequencer>;
