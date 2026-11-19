import { useCallback, useEffect, useRef, useState } from "react";

/** Grace after endsAt so the server clock is surely past it (avoids a failed-precondition). */
export const REVEAL_GRACE_MS = 300;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 10_000;

export function revealDue({ endsAt, now, allAnswered }: { endsAt: number; now: number; allAnswered: boolean }) {
  if (!endsAt) return false;
  return allAnswered || now >= endsAt + REVEAL_GRACE_MS;
}

/** How many CURRENT players answered (answers of kicked players stay in the node but do not count). */
export function answeredCount(playerUids: readonly string[], answerUids: readonly string[]): number {
  const answered = new Set(answerUids);
  return playerUids.filter((uid) => answered.has(uid)).length;
}

/** Every current player has an answer (intersection by uid, never a bare count comparison). */
export function allPlayersAnswered(playerUids: readonly string[], answerUids: readonly string[]): boolean {
  return playerUids.length > 0 && answeredCount(playerUids, answerUids) === playerUids.length;
}

/** Delay before automatic attempt n+1 after the n-th failure: 1 s, 2 s, 4 s, 8 s, then 10 s. */
export function revealBackoffMs(failures: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));
}

interface Options {
  /** current question index (guard key; also sent to the server as the expected qIndex) */
  qIndex: number;
  /** true only while the phase is "question" */
  active: boolean;
  /** see revealDue */
  due: boolean;
  /** another host action is in flight: hold automatic calls, re-evaluate when it clears */
  paused?: boolean;
  /** performs the reveal call; `{ already: true }` resolves too and counts as success */
  reveal: () => Promise<unknown>;
  onError?: (err: Error) => void;
}

/**
 * Reveals the current question automatically once `due` (or when the host presses the button).
 * Any failure re-arms the automatic call with a 1 s, 2 s, 4 s … (max 10 s) backoff for as long as
 * the question is active and due; success (incl. `already`) or a phase/question change stops it.
 * The host action is idempotent per qIndex, so repeated calls are safe.
 */
export function useAutoReveal({ qIndex, active, due, paused = false, reveal, onError }: Options) {
  const currentQ = useRef(qIndex);
  currentQ.current = qIndex;
  const doneFor = useRef<number | null>(null);
  const inFlight = useRef(false);
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingFor, setPendingFor] = useState<number | null>(null);
  // bumped when a backoff timer elapses so the effect re-evaluates
  const [wake, setWake] = useState(0);

  const latest = useRef({ reveal, onError });
  latest.current = { reveal, onError };

  const alive = useRef(true);
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimer();
    };
  }, []);

  // a new question (or leaving the question phase) resets the retry state
  useEffect(() => {
    failures.current = 0;
    clearTimer();
  }, [qIndex, active]);

  const send = useCallback(() => {
    if (doneFor.current === qIndex || inFlight.current) return;
    clearTimer();
    inFlight.current = true;
    setPendingFor(qIndex);
    latest.current.reveal().then(
      () => {
        inFlight.current = false;
        if (currentQ.current === qIndex) doneFor.current = qIndex;
      },
      (err: Error) => {
        inFlight.current = false;
        if (!alive.current || currentQ.current !== qIndex) return;
        setPendingFor(null);
        failures.current += 1;
        timer.current = setTimeout(() => {
          timer.current = null;
          setWake((w) => w + 1);
        }, revealBackoffMs(failures.current));
        latest.current.onError?.(err);
      },
    );
  }, [qIndex]);

  useEffect(() => {
    if (!active || !due || paused || timer.current) return;
    send();
  }, [active, due, paused, qIndex, send, wake]);

  return { reveal: send, sent: pendingFor === qIndex };
}
