/**
 * Declarative synth voices: every stage sound and every music note is described as a list of
 * Voice objects (oscillator or filtered noise + envelope). audioEngine.ts renders them with Web
 * Audio; keeping them as plain data makes them testable without an AudioContext.
 */

export interface VoiceFilter {
  type: BiquadFilterType;
  /** cutoff / centre frequency at the start (Hz) */
  f: number;
  /** cutoff at the end of the voice (exponential sweep) */
  to?: number;
  q?: number;
}

export interface Voice {
  /** oscillator waveform, or white noise */
  src: OscillatorType | "noise";
  /** pitch (Hz) for oscillators */
  f?: number;
  /** pitch glide target (Hz), reached after `glide` seconds (default: dur) */
  to?: number;
  glide?: number;
  /** detune in cents (for fat, layered unison voices) */
  detune?: number;
  /** start offset (s) */
  at: number;
  /** length (s): decay time for percussive voices, hold time for sustained ones */
  dur: number;
  /** peak gain 0..1 (before the bus level and the master compressor) */
  gain: number;
  /** attack time (s), default 5 ms */
  attack?: number;
  /** true: hold at peak for `dur`, then release (pads, brass); false: decay over `dur` */
  hold?: boolean;
  /** release after a held note (s), default 80 ms */
  release?: number;
  filter?: VoiceFilter;
}

export const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Shift every voice by `dt` seconds and scale gains (handy for building stingers). */
export const shift = (voices: Voice[], dt: number, gainScale = 1): Voice[] =>
  voices.map((v) => ({ ...v, at: v.at + dt, gain: Math.min(1, v.gain * gainScale) }));

// ---------- drums ----------

export const kick = (vel = 1): Voice[] => [
  { src: "sine", f: 160, to: 48, glide: 0.11, at: 0, dur: 0.32, gain: 0.9 * vel, attack: 0.002 },
  // beater click so the kick is audible on small projector speakers
  { src: "noise", at: 0, dur: 0.025, gain: 0.18 * vel, attack: 0.001, filter: { type: "highpass", f: 2500 } },
  { src: "triangle", f: 110, to: 70, glide: 0.08, at: 0, dur: 0.14, gain: 0.25 * vel, attack: 0.002 },
];

export const snare = (vel = 1): Voice[] => [
  { src: "noise", at: 0, dur: 0.17, gain: 0.42 * vel, attack: 0.001, filter: { type: "highpass", f: 1400 } },
  { src: "noise", at: 0, dur: 0.08, gain: 0.25 * vel, attack: 0.001, filter: { type: "bandpass", f: 3500, q: 1.2 } },
  { src: "triangle", f: 220, to: 170, glide: 0.05, at: 0, dur: 0.09, gain: 0.3 * vel, attack: 0.001 },
];

export const clap = (vel = 1): Voice[] => [
  ...[0, 0.011, 0.023].map(
    (at): Voice => ({
      src: "noise",
      at,
      dur: 0.03,
      gain: 0.3 * vel,
      attack: 0.001,
      filter: { type: "bandpass", f: 1300, q: 1.4 },
    }),
  ),
  { src: "noise", at: 0.03, dur: 0.16, gain: 0.22 * vel, attack: 0.002, filter: { type: "bandpass", f: 1500, q: 1 } },
];

export const hat = (vel = 1, open = false): Voice[] => [
  {
    src: "noise",
    at: 0,
    dur: open ? 0.22 : 0.045,
    gain: (open ? 0.16 : 0.14) * vel,
    attack: 0.001,
    filter: { type: "highpass", f: 7500 },
  },
];

export const crash = (vel = 1, dur = 1.6): Voice[] => [
  { src: "noise", at: 0, dur, gain: 0.28 * vel, attack: 0.002, filter: { type: "highpass", f: 4500 } },
  { src: "noise", at: 0, dur: dur * 0.5, gain: 0.14 * vel, attack: 0.002, filter: { type: "bandpass", f: 8500, q: 0.8 } },
];

export const tom = (midi: number, vel = 1): Voice[] => [
  { src: "sine", f: hz(midi), to: hz(midi) * 0.6, glide: 0.18, at: 0, dur: 0.24, gain: 0.55 * vel, attack: 0.002 },
  { src: "noise", at: 0, dur: 0.04, gain: 0.1 * vel, attack: 0.001, filter: { type: "lowpass", f: 3000 } },
];

/** Bandpass-swept noise "whoosh". */
export const swoosh = (dur: number, from = 300, to = 6000, gain = 0.3): Voice[] => [
  {
    src: "noise",
    at: 0,
    dur,
    gain,
    attack: dur * 0.85,
    hold: true,
    release: dur * 0.15,
    filter: { type: "bandpass", f: from, to, q: 3 },
  },
];

// ---------- pitched ----------

export const bass = (midi: number, dur: number, vel = 1): Voice[] => [
  {
    src: "sawtooth",
    f: hz(midi),
    at: 0,
    dur,
    gain: 0.3 * vel,
    attack: 0.004,
    filter: { type: "lowpass", f: 1400, to: 300, q: 4 },
  },
  { src: "sine", f: hz(midi), at: 0, dur, gain: 0.35 * vel, attack: 0.004 },
];

/** Short plucked arp note. */
export const pluck = (midi: number, vel = 1): Voice[] => [
  {
    src: "square",
    f: hz(midi),
    at: 0,
    dur: 0.2,
    gain: 0.11 * vel,
    attack: 0.002,
    filter: { type: "lowpass", f: 4200, to: 700, q: 2 },
  },
  { src: "triangle", f: hz(midi + 12), at: 0, dur: 0.12, gain: 0.05 * vel, attack: 0.002 },
];

/** Sustained two-saw lead (slightly detuned). */
export const lead = (midi: number, dur: number, vel = 1): Voice[] =>
  [-7, 7].map(
    (detune): Voice => ({
      src: "sawtooth",
      f: hz(midi),
      detune,
      at: 0,
      dur,
      gain: 0.085 * vel,
      attack: 0.012,
      hold: true,
      release: 0.12,
      filter: { type: "lowpass", f: 2600, q: 1 },
    }),
  );

/** Soft chord pad. */
export const pad = (notes: number[], dur: number, vel = 1): Voice[] =>
  notes.flatMap((n) =>
    [-9, 9].map(
      (detune): Voice => ({
        src: "sawtooth",
        f: hz(n),
        detune,
        at: 0,
        dur,
        gain: 0.028 * vel,
        attack: Math.min(0.25, dur / 3),
        hold: true,
        release: 0.3,
        filter: { type: "lowpass", f: 1100, q: 0.7 },
      }),
    ),
  );

/** Short bright chord stab (double-points flavour). */
export const stab = (notes: number[], vel = 1): Voice[] =>
  notes.map(
    (n): Voice => ({
      src: "sawtooth",
      f: hz(n),
      at: 0,
      dur: 0.16,
      gain: 0.07 * vel,
      attack: 0.003,
      filter: { type: "lowpass", f: 5000, to: 900, q: 3 },
    }),
  );

/** Brass-like chord: saws with a filter that opens during the attack. */
export const brass = (notes: number[], dur: number, vel = 1): Voice[] =>
  notes.flatMap((n) =>
    [-6, 6].map(
      (detune): Voice => ({
        src: "sawtooth",
        f: hz(n),
        detune,
        at: 0,
        dur,
        gain: 0.06 * vel,
        attack: 0.04,
        hold: true,
        release: 0.25,
        filter: { type: "lowpass", f: 900, to: 3800, q: 1.5 },
      }),
    ),
  );

/** Bell / sparkle. */
export const bell = (midi: number, vel = 1, dur = 0.7): Voice[] => [
  { src: "sine", f: hz(midi), at: 0, dur, gain: 0.14 * vel, attack: 0.002 },
  { src: "sine", f: hz(midi) * 2.76, at: 0, dur: dur * 0.4, gain: 0.04 * vel, attack: 0.002 },
];
