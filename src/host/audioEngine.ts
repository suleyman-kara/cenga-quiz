/**
 * Web Audio engine for the stage: renders the declarative voices from sound.ts / music.ts.
 *
 *   track bus ─┐                                   ┌─> reverb (convolver) ─┐
 *              ├─> music bus (level) ──────────────┤                       ├─> mix ─> compressor ─> limiter ─> master (mute) ─> out
 *   stingers ──────> effects bus (level) ──────────┘───────────────────────┘
 *
 * Music runs through a lookahead scheduler on the AudioContext clock; each loop has its own
 * bus so switching tracks is a short crossfade and two loops never keep running together.
 * Every public method is a no-op where Web Audio is unavailable, and never throws.
 */
import { SOUNDS, createJoinLimiter, type MusicState, type SoundName } from "./sound";
import { createSequencer, getTrack, noteVoices, type Sequencer } from "./music";
import type { Voice } from "./voices";

export interface StageAudio {
  /** false where Web Audio does not exist or could not start */
  readonly available: boolean;
  /** the browser still blocks audio (no user gesture yet) */
  blocked(): boolean;
  /** call from a user gesture (click / key) */
  unlock(): void;
  /** called when the context starts or stops running */
  onChange(cb: () => void): () => void;
  play(name: SoundName): void;
  setMusic(m: MusicState | null): void;
  /** 0..1 each */
  setLevels(music: number, sfx: number): void;
  setMuted(muted: boolean): void;
  dispose(): void;
  debug(): { music: string | null; tracksStarted: number; activeTracks: number };
}

type AudioCtor = typeof AudioContext;

const TICK_MS = 25;
/** schedule this far ahead (s); much further while the tab is hidden (timers throttled to ~1 s) */
const AHEAD = 0.15;
const AHEAD_HIDDEN = 1.6;
const MUSIC_REVERB = 0.12;
const SFX_REVERB = 0.22;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function noop(): StageAudio {
  return {
    available: false,
    blocked: () => false,
    unlock: () => undefined,
    onChange: () => () => undefined,
    play: () => undefined,
    setMusic: () => undefined,
    setLevels: () => undefined,
    setMuted: () => undefined,
    dispose: () => undefined,
    debug: () => ({ music: null, tracksStarted: 0, activeTracks: 0 }),
  };
}

function makeContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** A small room: exponentially decaying stereo noise. */
function impulse(ctx: AudioContext, seconds = 1.7): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return buf;
}

export function createStageAudio(): StageAudio {
  const made = makeContext();
  if (!made) return noop();
  const ctx: AudioContext = made;

  let musicBus: GainNode;
  let sfxBus: GainNode;
  let master: GainNode;
  let noise: AudioBuffer;
  try {
    noise = noiseBuffer(ctx);
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    limiter.connect(master);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    comp.connect(limiter);

    const mix = ctx.createGain();
    mix.gain.value = 0.85;
    mix.connect(comp);

    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.6;
    reverb.connect(reverbReturn).connect(mix);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0.6;
    musicBus.connect(mix);
    const musicSend = ctx.createGain();
    musicSend.gain.value = MUSIC_REVERB;
    musicBus.connect(musicSend).connect(reverb);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.85;
    sfxBus.connect(mix);
    const sfxSend = ctx.createGain();
    sfxSend.gain.value = SFX_REVERB;
    sfxBus.connect(sfxSend).connect(reverb);
  } catch {
    void ctx.close?.().catch(() => undefined);
    return noop();
  }

  const listeners = new Set<() => void>();
  const notify = () => {
    for (const cb of listeners) cb();
  };
  const running = () => ctx.state === "running";
  const allowJoin = createJoinLimiter(0.15);
  let disposed = false;
  let muted = false;
  let desired: MusicState | null = null;
  let current: { key: string; seq: Sequencer; bus: GainNode } | null = null;
  let tracksStarted = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function renderVoice(v: Voice, t0: number, dest: AudioNode, pitch = 1) {
    const t = Math.max(t0 + v.at, 0);
    const attack = Math.max(0.001, v.attack ?? 0.005);
    const peak = Math.max(0.0002, v.gain);
    let src: AudioScheduledSourceNode;
    let start: () => void;
    if (v.src === "noise") {
      const b = ctx.createBufferSource();
      b.buffer = noise;
      b.loop = true;
      // random offset into the shared noise so repeated hits do not sound identical
      start = () => b.start(t, Math.random() * 1.5);
      src = b;
    } else {
      const o = ctx.createOscillator();
      o.type = v.src;
      const f = (v.f ?? 440) * pitch;
      o.frequency.setValueAtTime(f, t);
      if (v.to) o.frequency.exponentialRampToValueAtTime(v.to * pitch, t + (v.glide ?? v.dur));
      if (v.detune) o.detune.value = v.detune;
      start = () => o.start(t);
      src = o;
    }
    let node: AudioNode = src;
    if (v.filter) {
      const fl = ctx.createBiquadFilter();
      fl.type = v.filter.type;
      fl.frequency.setValueAtTime(v.filter.f, t);
      if (v.filter.to) fl.frequency.exponentialRampToValueAtTime(v.filter.to, t + v.dur);
      if (v.filter.q !== undefined) fl.Q.value = v.filter.q;
      node.connect(fl);
      node = fl;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    let end: number;
    if (v.hold) {
      const hold = Math.max(attack, v.dur);
      end = t + hold + (v.release ?? 0.08);
      g.gain.setValueAtTime(peak, t + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
    } else {
      end = t + Math.max(v.dur, attack + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
    }
    node.connect(g).connect(dest);
    src.onended = () => {
      try {
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
    start();
    src.stop(end + 0.03);
  }

  function pump() {
    if (disposed || !current || !running()) return;
    const hidden = typeof document !== "undefined" && document.hidden;
    try {
      current.seq.pump(ctx.currentTime, hidden ? AHEAD_HIDDEN : AHEAD);
    } catch {
      /* a broken node must not kill the stage */
    }
  }

  function ensureTimer() {
    if (current && !timer && !disposed) timer = setInterval(pump, TICK_MS);
    if (!current && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function fadeOut(bus: GainNode) {
    const now = ctx.currentTime;
    try {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.setTargetAtTime(0, now, 0.12);
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        bus.disconnect();
      } catch {
        /* ignore */
      }
    }, 2500);
  }

  function sync() {
    if (disposed) return;
    const want = desired && !muted ? desired : null;
    const key = want ? want.track + (want.double ? ":double" : "") : null;
    if (current && current.key !== key) {
      fadeOut(current.bus);
      current = null;
    }
    if (want && key && !current && running()) {
      try {
        const bus = ctx.createGain();
        const now = ctx.currentTime;
        bus.gain.setValueAtTime(0.0001, now);
        bus.gain.linearRampToValueAtTime(1, now + (want.track === "lobby" ? 0.6 : 0.05));
        bus.connect(musicBus);
        const seq = createSequencer(getTrack(want.track, want.double), now + 0.06, (n) => {
          for (const v of noteVoices(n.ev, n.stepDur)) renderVoice(v, n.time, bus);
        });
        current = { key, seq, bus };
        tracksStarted++;
      } catch {
        current = null;
      }
    }
    if (current && want) current.seq.setUrgent(want.urgent);
    ensureTimer();
    pump();
  }

  const onVisibility = () => pump();
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  ctx.onstatechange = () => {
    sync();
    notify();
  };

  return {
    available: true,
    blocked: () => !disposed && ctx.state !== "running",
    unlock() {
      if (disposed || ctx.state !== "suspended") return;
      try {
        void ctx
          .resume()
          .then(() => {
            sync();
            notify();
          })
          .catch(() => undefined);
      } catch {
        /* ignore */
      }
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    play(name) {
      if (disposed || !running()) return;
      try {
        let pitch = 1;
        if (name === "join") {
          if (!allowJoin(ctx.currentTime)) return;
          pitch = 1 + Math.random() * 0.3; // a little variety when several join in a row
        }
        const t0 = ctx.currentTime + 0.01;
        for (const v of SOUNDS[name]) renderVoice(v, t0, sfxBus, pitch);
      } catch {
        /* ignore */
      }
    },
    setMusic(m) {
      desired = m;
      try {
        sync();
      } catch {
        /* ignore */
      }
    },
    setLevels(music, sfx) {
      if (disposed) return;
      const now = ctx.currentTime;
      try {
        musicBus.gain.setTargetAtTime(clamp01(music), now, 0.04);
        sfxBus.gain.setTargetAtTime(clamp01(sfx), now, 0.04);
      } catch {
        /* ignore */
      }
    },
    setMuted(m) {
      if (disposed) return;
      muted = m;
      try {
        master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
        sync();
      } catch {
        /* ignore */
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      current = null;
      if (timer) clearInterval(timer);
      timer = null;
      listeners.clear();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      ctx.onstatechange = null;
      try {
        void ctx.close().catch(() => undefined);
      } catch {
        /* ignore */
      }
    },
    debug: () => ({ music: current?.key ?? null, tracksStarted, activeTracks: current ? 1 : 0 }),
  };
}
