import { get, ref, serverTimestamp, set } from "firebase/database";
import { signInAnonymously } from "firebase/auth";
import type { AnswerEntry, GameState, PlayerEntry } from "../../shared/types";
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

export type GameCheck = "ok" | "notFound" | "started";

/** One-off reads of meta + state (no subscription). */
export async function checkGame(pin: string): Promise<GameCheck> {
  await ensureUid();
  const meta = await get(ref(db, paths.meta(pin)));
  if (!meta.exists()) return "notFound";
  const state = await get(ref(db, paths.state(pin)));
  const phase = (state.val() as GameState | null)?.phase;
  if (phase === "ended") return "notFound";
  return phase === "lobby" || phase === undefined ? "ok" : "started";
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
