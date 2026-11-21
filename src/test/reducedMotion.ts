import { vi } from "vitest";
import { REDUCED_MOTION_QUERY } from "../theme/motion";

type Listener = (e: { matches: boolean }) => void;

/**
 * Installs a controllable window.matchMedia (jsdom has none) for the reduced-motion query.
 * Call `restoreMatchMedia()` in afterEach.
 */
export function mockReducedMotion(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  const mql = {
    get matches() {
      return matches;
    },
    media: REDUCED_MOTION_QUERY,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  };
  const other = {
    matches: false,
    media: "",
    addEventListener() {},
    removeEventListener() {},
  };
  const fn = vi.fn((q: string) => (q === REDUCED_MOTION_QUERY ? mql : other));
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: fn,
  });
  return {
    set(next: boolean) {
      matches = next;
      listeners.forEach((l) => l({ matches }));
    },
    listeners,
  };
}

export function restoreMatchMedia() {
  delete (window as { matchMedia?: unknown }).matchMedia;
}
