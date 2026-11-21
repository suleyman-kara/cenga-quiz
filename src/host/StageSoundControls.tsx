import { useEffect, useId, useRef, useState } from "react";
import { t } from "../i18n";
import type { StageSounds } from "./useStageSounds";

/** Header button that opens two sliders: music and effects level. */
export function SoundLevelsControl({ sound }: { sound: StageSounds }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div className="sound-levels" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="chip chip--stage chip--sound chip--volume"
        aria-expanded={open}
        aria-controls={id}
        aria-label={t("hostGame.soundVolume")}
        title={t("hostGame.soundVolume")}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 4v16M12 4v16M19 4v16" />
          <circle cx="5" cy="14" r="2" />
          <circle cx="12" cy="8" r="2" />
          <circle cx="19" cy="16" r="2" />
        </svg>
      </button>
      {open && (
        <div id={id} className="sound-levels__panel" role="group" aria-label={t("hostGame.soundVolume")}>
          <label className="sound-levels__row">
            <span>{t("hostGame.musicVolume")}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(sound.musicLevel * 100)}
              onChange={(e) => sound.setMusicLevel(Number(e.target.value) / 100)}
            />
          </label>
          <label className="sound-levels__row">
            <span>{t("hostGame.sfxVolume")}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(sound.sfxLevel * 100)}
              onChange={(e) => sound.setSfxLevel(Number(e.target.value) / 100)}
            />
          </label>
        </div>
      )}
    </div>
  );
}

/** Lobby banner while the browser blocks audio or the host muted it; one click turns it on. */
export function SoundOffBanner({ onEnable }: { onEnable: () => void }) {
  return (
    <button type="button" className="stage-sound-off" onClick={onEnable}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 9h4l5-4v14l-5-4H4z" />
        <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />
      </svg>
      <span>{t("hostGame.soundOff")}</span>
    </button>
  );
}
