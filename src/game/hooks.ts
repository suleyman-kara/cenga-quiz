/**
 * Realtime subscriptions. Every hook returns `undefined` while loading and
 * `null` when the node does not exist.
 *
 * TRAFFIC RULE: player screens use only useGameState, useQuestion, useReveal,
 * useLeaderboard, useMyScore, useMyPlayer, useBanned, useHostOnline, useQuestionOptions (+ useMeta) — all single small nodes. usePlayers / useAnswerUids are
 * host-only — they subscribe to lists that grow with the audience.
 */
import { useEffect, useRef, useState } from "react";
import { get, onValue, ref } from "firebase/database";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import type {
  GameMeta,
  GameState,
  Leaderboard,
  PlayerEntry,
  PlayerScore,
  PublicQuestion,
  RevealData,
} from "../../shared/types";
import { auth, db } from "../firebase";
import { paths } from "./paths";
import { subscribeWithRetry } from "./resilient";

/** Before re-subscribing a cancelled listener: wait for auth, then refresh the (maybe expired) token. */
async function reauth(): Promise<void> {
  await auth.authStateReady();
  await auth.currentUser?.getIdToken(true);
}

/** Signed-in uid (any provider), or null; does not sign anybody in. */
function useAuthUid(): string | null {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null)), []);
  return uid;
}

/**
 * Subscribes once a user is signed in: rules require auth, and a listener
 * attached before auth is restored (e.g. after a refresh) would be cancelled.
 * A cancelled listener (permission-denied after a long sleep / token refresh) keeps its last
 * value and is re-subscribed with backoff; only if it stays cancelled does it read as `null`.
 */
function useRtdbValue<T>(path: string | null): T | null | undefined {
  const uid = useAuthUid();
  const key = path && uid ? `${uid}|${path}` : null;
  const [value, setValue] = useState<{ key: string | null; v: T | null | undefined }>({ key, v: undefined });
  useEffect(() => {
    if (!key || !path) return;
    return subscribeWithRetry<T | null>({
      subscribe: (onData, onCancel) =>
        onValue(ref(db, path), (snap) => onData(snap.exists() ? (snap.val() as T) : null), onCancel),
      onData: (v) => setValue({ key, v }),
      onTerminal: () => setValue({ key, v: null }),
      beforeRetry: reauth,
    });
  }, [key, path]);
  return value.key === key ? value.v : undefined;
}

/** Current uid; signs in anonymously if nobody is signed in. */
export function usePlayerUid(): string | null {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        if (u) setUid(u.uid);
        else void signInAnonymously(auth).catch(() => setUid(null));
      }),
    [],
  );
  return uid;
}

export const useGameState = (pin: string) => useRtdbValue<GameState>(paths.state(pin));
export const useMeta = (pin: string) => useRtdbValue<GameMeta>(paths.meta(pin));
export const useQuestion = (pin: string) => useRtdbValue<PublicQuestion>(paths.question(pin));
export const useReveal = (pin: string) => useRtdbValue<RevealData>(paths.reveal(pin));
export const useLeaderboard = (pin: string) => useRtdbValue<Leaderboard>(paths.leaderboard(pin));
export const useMyScore = (pin: string, uid: string | null) =>
  useRtdbValue<PlayerScore>(uid ? paths.score(pin, uid) : null);

/** The player's OWN players/{uid} entry: the server may rename it at start; null once removed. */
export const useMyPlayer = (pin: string, uid: string | null) =>
  useRtdbValue<PlayerEntry>(uid ? paths.player(pin, uid) : null);
/** true once the host kicked this player (banned/{uid} is readable by that uid). */
export const useBanned = (pin: string, uid: string | null) => useRtdbValue<true>(uid ? paths.banned(pin, uid) : null);

/** How often / how long a player retries reading the options right after they open (clock skew). */
export const OPTIONS_RETRY_MS = 250;
export const OPTIONS_MAX_TRIES = 40;

/**
 * Options of question `qIndex` (games/{pin}/options/{qIndex}). Players may read them only once
 * answering opened (rules: now >= state.startedAt), so the read is a one-shot get() timed for
 * `openAt` on the server clock and retried briefly; the host passes `openAt = null` (no wait).
 * undefined until read.
 */
export function useQuestionOptions(pin: string, qIndex: number, openAt: number | null): string[] | undefined {
  const uid = useAuthUid();
  const offset = useRtdbValue<number>(".info/serverTimeOffset") ?? 0;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const key = uid && qIndex >= 0 ? `${uid}|${pin}|${qIndex}|${openAt ?? "now"}` : null;
  const [value, setValue] = useState<{ key: string | null; v: string[] | undefined }>({ key, v: undefined });
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = (n: number) => {
      get(ref(db, paths.options(pin, qIndex))).then(
        (snap) => {
          if (cancelled) return;
          if (snap.exists()) setValue({ key, v: snap.val() as string[] });
          else if (n < OPTIONS_MAX_TRIES) timer = setTimeout(() => attempt(n + 1), OPTIONS_RETRY_MS);
        },
        () => {
          // permission denied a few ms early (clocks differ slightly): try again
          if (!cancelled && n < OPTIONS_MAX_TRIES) timer = setTimeout(() => attempt(n + 1), OPTIONS_RETRY_MS);
        },
      );
    };
    const wait = openAt === null ? 0 : Math.max(0, openAt - (Date.now() + offsetRef.current));
    timer = setTimeout(() => attempt(0), wait);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, pin, qIndex, openAt]);
  return value.key === key ? value.v : undefined;
}

/** true while the host's big screen is connected (set by useHostPresence); null when it is not. */
export const useHostOnline = (pin: string) => useRtdbValue<true>(paths.hostOnline(pin));

export interface PlayerListItem extends PlayerEntry {
  uid: string;
}

/** HOST ONLY: everyone in the room, in join order. */
export function usePlayers(pin: string): PlayerListItem[] {
  const map = useRtdbValue<Record<string, PlayerEntry>>(paths.players(pin));
  return Object.entries(map ?? {})
    .map(([uid, p]) => ({ uid, ...p }))
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

/**
 * HOST ONLY: uids that answered question `qIndex`. Kicked players' answers stay in the node, so
 * callers intersect with the current player list (see allPlayersAnswered).
 */
export function useAnswerUids(pin: string, qIndex: number): string[] {
  const map = useRtdbValue<Record<string, unknown>>(qIndex >= 0 ? paths.answers(pin, qIndex) : null);
  return map ? Object.keys(map) : [];
}

/** Server-corrected clock (ms), re-rendering every `tickMs`. */
export function useServerNow(tickMs = 250): number {
  const offset = useRtdbValue<number>(".info/serverTimeOffset") ?? 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);
  return now + offset;
}
