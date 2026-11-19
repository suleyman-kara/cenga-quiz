/**
 * Realtime subscriptions. Every hook returns `undefined` while loading and
 * `null` when the node does not exist.
 *
 * TRAFFIC RULE: player screens use only useGameState, useQuestion, useReveal,
 * useLeaderboard, useMyScore (+ useMeta). usePlayers / useAnswerCount are
 * host-only — they subscribe to lists that grow with the audience.
 */
import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
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

/** Signed-in uid (any provider), or null; does not sign anybody in. */
function useAuthUid(): string | null {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null)), []);
  return uid;
}

/**
 * Subscribes once a user is signed in: rules require auth, and a listener
 * attached before auth is restored (e.g. after a refresh) would be cancelled.
 */
function useRtdbValue<T>(path: string | null): T | null | undefined {
  const uid = useAuthUid();
  const key = path && uid ? `${uid}|${path}` : null;
  const [value, setValue] = useState<{ key: string | null; v: T | null | undefined }>({ key, v: undefined });
  useEffect(() => {
    if (!key || !path) return;
    return onValue(
      ref(db, path),
      (snap) => setValue({ key, v: snap.exists() ? (snap.val() as T) : null }),
      () => setValue({ key, v: null }),
    );
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

/** HOST ONLY: how many players answered question `qIndex`. */
export function useAnswerCount(pin: string, qIndex: number): number {
  const map = useRtdbValue<Record<string, unknown>>(qIndex >= 0 ? paths.answers(pin, qIndex) : null);
  return map ? Object.keys(map).length : 0;
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
