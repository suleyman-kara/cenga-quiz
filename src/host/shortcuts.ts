import { useEffect, useRef } from "react";

/** What a key press on the big screen asks for. */
export type StageShortcut = "next" | "reveal" | "pause";

const NEXT_KEYS = new Set([" ", "Spacebar", "Enter", "PageDown", "ArrowRight"]);

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, button, a[href], summary, [contenteditable=''], [contenteditable='true']"))
    return true;
  // an open dialog handles its own keys (Enter = its focused button)
  return !!target.closest("[role='dialog'], [role='alertdialog'], dialog");
}

/**
 * Maps a keydown to a stage step. Space / Enter / PageDown / → (presentation remotes send
 * PageDown or →) go to the next step; R reveals; P pauses / resumes the question. Keys typed into a field, pressed on a focused
 * control (which already acts on them) or held with a modifier are ignored.
 */
export function stageShortcut(e: Pick<KeyboardEvent, "key" | "target" | "altKey" | "ctrlKey" | "metaKey" | "repeat">): StageShortcut | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return null;
  if (isInteractive(e.target)) return null;
  if (NEXT_KEYS.has(e.key)) return "next";
  if (e.key === "r" || e.key === "R") return "reveal";
  if (e.key === "p" || e.key === "P") return "pause";
  return null;
}

/** Listens on window while mounted; `handler` may change every render. */
export function useStageShortcuts(handler: (s: StageShortcut) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stageShortcut(e);
      if (!s) return;
      e.preventDefault();
      ref.current(s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
