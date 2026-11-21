import { useSyncExternalStore } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const hasMatchMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

/** Whether the OS/browser asks for reduced motion right now (false where unsupported). */
export function prefersReducedMotion(): boolean {
  return hasMatchMedia() && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => undefined;
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * Live `prefers-reduced-motion: reduce`. CSS already switches animations off with the media
 * query; components use this to skip rendering purely decorative moving elements (confetti).
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
