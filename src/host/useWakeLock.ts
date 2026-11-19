import { useEffect, useState } from "react";

interface Sentinel {
  release(): Promise<void>;
  addEventListener(type: "release", cb: () => void): void;
}
type WakeLockNavigator = Navigator & { wakeLock?: { request(type: "screen"): Promise<Sentinel> } };

/**
 * Keeps the presentation screen awake (Screen Wake Lock API, feature-detected). Browsers drop the
 * lock when the tab is hidden, so it is re-acquired on visibilitychange → visible.
 * Returns whether a lock is currently held.
 */
export function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const wl = (navigator as WakeLockNavigator).wakeLock;
    if (!active || !wl) return;
    let sentinel: Sentinel | null = null;
    let disposed = false;

    const acquire = async () => {
      if (sentinel || disposed) return;
      try {
        const s = await wl.request("screen");
        if (disposed) {
          void s.release();
          return;
        }
        sentinel = s;
        setHeld(true);
        s.addEventListener("release", () => {
          if (sentinel === s) sentinel = null;
          if (!disposed) setHeld(false);
        });
      } catch {
        /* denied (battery saver, not visible): try again on the next visibility change */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
      sentinel = null;
      setHeld(false);
    };
  }, [active]);

  return held;
}
