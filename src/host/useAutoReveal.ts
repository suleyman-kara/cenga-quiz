import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  /** current question index (guard key) */
  qIndex: number;
  /** true only while the phase is "question" */
  active: boolean;
  /** countdown reached zero or every player answered */
  due: boolean;
  /** performs the actual reveal call */
  reveal: () => Promise<unknown>;
  onError?: (err: Error) => void;
}

/**
 * Calls `reveal` at most once per question: automatically when `due`, or when
 * the host presses the button. A failed manual/auto call can be retried with
 * the button, but is never retried automatically (no request loops).
 */
export function useAutoReveal({ qIndex, active, due, reveal, onError }: Options) {
  const sentFor = useRef<number | null>(null);
  const autoFor = useRef<number | null>(null);
  const [pendingFor, setPendingFor] = useState<number | null>(null);

  const latest = useRef({ reveal, onError });
  latest.current = { reveal, onError };

  const send = useCallback(() => {
    if (sentFor.current === qIndex) return;
    sentFor.current = qIndex;
    setPendingFor(qIndex);
    latest.current.reveal().catch((err: Error) => {
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
