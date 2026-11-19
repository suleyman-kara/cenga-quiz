import { useCallback, useEffect, useRef, useState } from "react";
import { createSoundPlayer, soundCue, type StageSnapshot } from "./sound";

const KEY = "stage-sound-muted";

function readMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Plays stage sounds on state transitions; the on/off choice is remembered per browser. */
export function useStageSounds(snapshot: StageSnapshot | null) {
  const [muted, setMuted] = useState(readMuted);
  const player = useRef<ReturnType<typeof createSoundPlayer> | null>(null);
  const prev = useRef<StageSnapshot | null>(null);

  // Create the player right away: the host usually clicked "start game" on the panel, so the
  // browser already allows audio and lobby sounds work without another click. After a reload
  // audio stays blocked until the first click/key on the page (Start, Next…), which unlocks it.
  useEffect(() => {
    player.current ??= createSoundPlayer();
    player.current.unlock();
    const unlock = () => {
      player.current ??= createSoundPlayer();
      player.current.unlock();
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  const phase = snapshot?.phase;
  const qIndex = snapshot?.qIndex;
  const players = snapshot?.players;
  const secondsLeft = snapshot?.secondsLeft;
  useEffect(() => {
    if (phase === undefined || qIndex === undefined || players === undefined || secondsLeft === undefined) return;
    const next: StageSnapshot = { phase, qIndex, players, secondsLeft };
    const cues = soundCue(prev.current, next);
    prev.current = next;
    if (muted || !player.current) return;
    for (const c of cues) player.current.play(c);
  }, [phase, qIndex, players, secondsLeft, muted]);

  const toggle = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try {
        if (next) localStorage.setItem(KEY, "1");
        else localStorage.removeItem(KEY);
      } catch {
        /* storage blocked: the toggle still works on this page */
      }
      return next;
    });
  }, []);

  return { muted, toggle };
}
