interface WatchdogOptions {
  isConnected: () => boolean;
  /** e.g. goOffline(db); goOnline(db) */
  reconnect: () => void;
  delayMs?: number;
}

/**
 * Phones suspend sockets when the screen locks or the tab is backgrounded, and the SDK can take
 * a long time to notice. When the page comes back (visible / restored from bfcache) and the
 * realtime connection is still down after `delayMs`, force a fresh connection.
 */
export function createReconnectWatchdog({ isConnected, reconnect, delayMs = 3000 }: WatchdogOptions): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!isConnected()) reconnect();
    }, delayMs);
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") check();
  };
  const onPageShow = (e: Event) => {
    if ((e as PageTransitionEvent).persisted) check();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
  };
}
