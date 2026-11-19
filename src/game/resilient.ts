/** Default waits before re-subscribing a cancelled listener (then it is treated as gone). */
export const RESUBSCRIBE_DELAYS_MS = [1000, 2000, 4000] as const;

interface Options<T> {
  /** attaches a listener; returns its unsubscribe */
  subscribe: (onData: (v: T) => void, onCancel: (err: Error) => void) => () => void;
  onData: (v: T) => void;
  /** the listener stayed cancelled after every retry */
  onTerminal: (err: Error) => void;
  /** runs before each re-subscription, e.g. wait for auth to be restored / refresh the token */
  beforeRetry: () => Promise<void>;
  delaysMs?: readonly number[];
}

/**
 * Keeps a realtime listener alive across cancellations. The RTDB SDK cancels a listener on
 * permission-denied, which also happens transiently (token refresh after a long sleep, auth
 * restored late) — not only when the node is really gone. So a cancel re-checks auth and
 * re-subscribes with backoff; only after `delaysMs.length` consecutive failures is it terminal.
 * Real removals (banned flag, own entry deleted) arrive as DATA, never through this path.
 */
export function subscribeWithRetry<T>({
  subscribe,
  onData,
  onTerminal,
  beforeRetry,
  delaysMs = RESUBSCRIBE_DELAYS_MS,
}: Options<T>): () => void {
  let stopped = false;
  let failures = 0;
  let unsub: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const start = () => {
    unsub = subscribe(
      (v) => {
        failures = 0;
        onData(v);
      },
      (err) => {
        unsub?.();
        unsub = null;
        if (stopped) return;
        if (failures >= delaysMs.length) {
          onTerminal(err);
          return;
        }
        const delay = delaysMs[failures++]!;
        timer = setTimeout(() => {
          void beforeRetry()
            .catch(() => undefined)
            .then(() => {
              if (!stopped) start();
            });
        }, delay);
      },
    );
  };

  start();
  return () => {
    stopped = true;
    clearTimeout(timer);
    unsub?.();
    unsub = null;
  };
}
