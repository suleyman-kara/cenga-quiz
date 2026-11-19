import { get, ref, serverTimestamp, set } from "firebase/database";
import { signInAnonymously } from "firebase/auth";
import type { AnswerEntry, GameMeta, GameState, PlayerEntry } from "../../shared/types";
import { auth, db } from "../firebase";
import { paths } from "./paths";

type ServerStamped<T, K extends keyof T> = Omit<T, K> & { [P in K]: object };

/** Reuses the current (possibly persisted) user; otherwise signs in anonymously. */
export async function ensureUid(): Promise<string> {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

export type GameCheck =
  | { kind: "ok" }
  | { kind: "rejoin"; name: string }
  | { kind: "notFound" | "started" | "banned" | "locked" | "full" };

/**
 * One-off reads (no subscription): meta, state, and the player's OWN banned/players entries.
 * players/{uid} is write-once, so somebody who already joined must rejoin, not join again.
 */
export async function checkGame(pin: string): Promise<GameCheck> {
  const uid = await ensureUid();
  const meta = await get(ref(db, paths.meta(pin)));
  if (!meta.exists()) return { kind: "notFound" };
  const [state, banned, me] = await Promise.all([
    get(ref(db, paths.state(pin))),
    get(ref(db, paths.banned(pin, uid))),
    get(ref(db, paths.player(pin, uid))),
  ]);
  const phase = (state.val() as GameState | null)?.phase;
  if (phase === "ended") return { kind: "notFound" };
  if (banned.exists()) return { kind: "banned" };
  if (me.exists()) return { kind: "rejoin", name: (me.val() as PlayerEntry).name };
  if (phase !== "lobby" && phase !== undefined) return { kind: "started" };
  if ((meta.val() as GameMeta).locked === true) return { kind: "locked" };
  if ((meta.val() as GameMeta).full === true) return { kind: "full" };
  return { kind: "ok" };
}

/** Writes players/{uid}; `name` must already be normalized and valid. */
export async function joinGame(pin: string, name: string): Promise<string> {
  const uid = await ensureUid();
  const entry: ServerStamped<PlayerEntry, "joinedAt"> = { name, joinedAt: serverTimestamp() };
  await set(ref(db, paths.player(pin, uid)), entry);
  return uid;
}

export async function submitAnswer(pin: string, qIndex: number, choice: number): Promise<void> {
  const uid = await ensureUid();
  const entry: ServerStamped<AnswerEntry, "at"> = { choice, at: serverTimestamp() };
  await set(ref(db, paths.answer(pin, qIndex, uid)), entry);
}

/**
 * The player's OWN recorded answer for `qIndex` (rules allow reading answers/{q}/{uid} by that
 * uid), or null. Used to confirm an answer whose acknowledgement was lost (e.g. the SDK resent
 * an accepted write and the write-once rule denied the duplicate, or the page reloaded).
 */
export async function fetchOwnAnswer(pin: string, qIndex: number): Promise<number | null> {
  const uid = await ensureUid();
  const snap = await get(ref(db, paths.answer(pin, qIndex, uid)));
  if (!snap.exists()) return null;
  const choice = (snap.val() as Partial<AnswerEntry>).choice;
  return typeof choice === "number" ? choice : null;
}
