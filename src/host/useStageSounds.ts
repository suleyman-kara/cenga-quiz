import { useCallback, useEffect, useRef, useState } from "react";
import { createStageAudio, type StageAudio } from "./audioEngine";
import { musicFor, soundCue, type StageSnapshot } from "./sound";

const MUTED_KEY = "stage-sound-muted";
const LEVELS_KEY = "stage-sound-levels";

export interface SoundLevels {
  music: number;
  sfx: number;
}
/** music sits a bit under the effects so cues stay clear */
export const DEFAULT_LEVELS: SoundLevels = { music: 0.55, sfx: 0.85 };

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

const level = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

function readLevels(): SoundLevels {
  try {
    const raw = localStorage.getItem(LEVELS_KEY);
    if (!raw) return DEFAULT_LEVELS;
    const p = JSON.parse(raw) as Partial<Record<keyof SoundLevels, unknown>> | null;
    return { music: level(p?.music, DEFAULT_LEVELS.music), sfx: level(p?.sfx, DEFAULT_LEVELS.sfx) };
  } catch {
    return DEFAULT_LEVELS;
  }
}

function writeLevels(l: SoundLevels) {
  try {
    localStorage.setItem(LEVELS_KEY, JSON.stringify(l));
  } catch {
    /* storage blocked: the levels still apply on this page */
  }
}

/**
 * Stage music + effects driven by game-state transitions. Mute and the music/effects levels are
 * remembered per browser. `off` is true while the browser still blocks audio or the host muted it.
 */
export function useStageSounds(snapshot: StageSnapshot | null) {
  const [muted, setMuted] = useState(readMuted);
  const [levels, setLevels] = useState(readLevels);
  const [blocked, setBlocked] = useState(false);
  const [audio, setAudio] = useState<StageAudio | null>(null);
  const prev = useRef<StageSnapshot | null>(null);

  // Create the engine right away: the host usually clicked "start game" on the panel, so the
  // browser already allows audio and the lobby music starts without another click. After a
  // reload audio stays blocked until the first click/key on the page, which unlocks it.
  useEffect(() => {
    const a = createStageAudio();
    setAudio(a);
    const refresh = () => setBlocked(a.blocked());
    const off = a.onChange(refresh);
    a.unlock();
    refresh();
    const unlock = () => a.unlock();
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      off();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      a.dispose();
      setAudio(null);
    };
  }, []);

  useEffect(() => {
    audio?.setLevels(levels.music, levels.sfx);
  }, [audio, levels]);

  useEffect(() => {
    audio?.setMuted(muted);
  }, [audio, muted]);

  const phase = snapshot?.phase;
  const qIndex = snapshot?.qIndex;
  const players = snapshot?.players;
  const secondsLeft = snapshot?.secondsLeft;
  const double = !!snapshot?.double;

  // stingers on transitions (never on the first snapshot)
  useEffect(() => {
    if (phase === undefined || qIndex === undefined || players === undefined || secondsLeft === undefined) return;
    const next: StageSnapshot = { phase, qIndex, players, secondsLeft, double };
    const cues = soundCue(prev.current, next);
    prev.current = next;
    if (muted || !audio) return;
    for (const c of cues) audio.play(c);
  }, [phase, qIndex, players, secondsLeft, double, muted, audio]);

  // the loop follows the state (also right after a reload)
  const music =
    phase === undefined || qIndex === undefined || secondsLeft === undefined
      ? null
      : musicFor({ phase, qIndex, players: players ?? 0, secondsLeft, double });
  const track = music?.track ?? null;
  const urgent = !!music?.urgent;
  const musicDouble = !!music?.double;
  useEffect(() => {
    if (!audio) return;
    audio.setMusic(track ? { track, double: musicDouble, urgent } : null);
  }, [audio, track, musicDouble, urgent]);

  const persistMuted = (m: boolean) => {
    try {
      if (m) localStorage.setItem(MUTED_KEY, "1");
      else localStorage.removeItem(MUTED_KEY);
    } catch {
      /* storage blocked: the toggle still works on this page */
    }
  };

  const toggle = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      persistMuted(next);
      return next;
    });
  }, []);

  /** "Sound is off" banner: unmute and unlock in one click. */
  const enable = useCallback(() => {
    persistMuted(false);
    setMuted(false);
    audio?.unlock();
  }, [audio]);

  const setMusicLevel = useCallback((v: number) => {
    setLevels((l) => {
      const next = { ...l, music: level(v, l.music) };
      writeLevels(next);
      return next;
    });
  }, []);
  const setSfxLevel = useCallback((v: number) => {
    setLevels((l) => {
      const next = { ...l, sfx: level(v, l.sfx) };
      writeLevels(next);
      return next;
    });
  }, []);

  return {
    muted,
    toggle,
    off: muted || blocked,
    enable,
    musicLevel: levels.music,
    sfxLevel: levels.sfx,
    setMusicLevel,
    setSfxLevel,
  };
}

export type StageSounds = ReturnType<typeof useStageSounds>;
