import { useCallback, useEffect, useRef, useState } from "react";
import { withRetry } from "./retry";

/** Grace after endsAt so the server clock is surely past it (avoids a failed-precondition). */
export const REVEAL_GRACE_MS = 300;
const RETRIES = 3;
const BACKOFF_MS = 1000;

export function revealDue({ endsAt, now, allAnswered }: { endsAt: number; now: number; allAnswered: boolean }) {
  if (!endsAt) return false;
  return allAnswered || now >= endsAt + REVEAL_GRACE_MS;
}

interface Options {
  /** current question index (guard key; also sent to the server as the expected qIndex) */
  qIndex: number;
  /** true only while the phase is "question" */
  active: boolean;
  /** see revealDue */
  due: boolean;
  /** performs the reveal call; `{ already: true }` resolves too and counts as success */
  reveal: () => Promise<unknown>;
  onError?: (err: Error) => void;
}

/**
 * Calls `reveal` at most once per question: automatically when `due`, or when the host presses
 * the button. failed-precondition (clock skew, lock contention) is retried up to 3 times with a
 * 1 s backoff; after a final failure the button can try again, never an automatic loop.
 */
export function useAutoReveal({ qIndex, active, due, reveal, onError }: Options) {
  const sentFor = useRef<number | null>(null);
  const autoFor = useRef<number | null>(null);
  const currentQ = useRef(qIndex);
  currentQ.current = qIndex;
  const [pendingFor, setPendingFor] = useState<number | null>(null);

  const latest = useRef({ reveal, onError });
  latest.current = { reveal, onError };

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const send = useCallback(() => {
    if (sentFor.current === qIndex) return;
    sentFor.current = qIndex;
    setPendingFor(qIndex);
    withRetry(() => latest.current.reveal(), {
      retries: RETRIES,
      delayMs: BACKOFF_MS,
      cancelled: () => !alive.current || currentQ.current !== qIndex,
    }).catch((err: Error) => {
      if (!alive.current || currentQ.current !== qIndex) return;
      sentFor.current = null;
      setPendingFor(null);
      latest.current.onError?.(err);
    });
  }, [qIndex]);

  useEffect(() => {
    if (!active || !due || autoFor.current === qIndex) return;
    autoFor.current = qIndex;
    send();
  }, [active, due, qIndex, send]);

  return { reveal: send, sent: pendingFor === qIndex };
}
