import type { GameMeta, GameState, LiveGameDoc, LockAction, Quiz, StateLock } from "../../../shared/types";
import { GameError } from "../core/errors";
import { lockState, ownsLock, unlockState } from "../core/lock";
import type { Patch, Room } from "../core/room";
import { database, firestore } from "./firebase";

/** Room nodes a transition may need besides meta/state. */
export type RoomPart = "players" | "answers" | "scores" | "leaderboard" | "banned";

/** meta + state only (small): enough for host and phase checks. */
export async function readHead(pin: string): Promise<Pick<Room, "meta" | "state">> {
  const db = await database();
  const [meta, state] = await Promise.all([
    db.ref(`games/${pin}/meta`).get(),
    db.ref(`games/${pin}/state`).get(),
  ]);
  const room: Pick<Room, "meta" | "state"> = {};
  if (meta.exists()) room.meta = meta.val() as GameMeta;
  if (state.exists()) room.state = state.val() as GameState;
  return room;
}

/** Reads only the requested nodes; `answers` means answers/{qIndex} of the current question. */
export async function readParts(pin: string, parts: readonly RoomPart[], qIndex: number | undefined): Promise<Partial<Room>> {
  const db = await database();
  const out: Partial<Room> = {};
  await Promise.all(
    parts.map(async (part) => {
      if (part === "answers") {
        if (qIndex === undefined || qIndex < 0) return;
        const v = (await db.ref(`games/${pin}/answers/${qIndex}`).get()).val();
        if (v) out.answers = { [String(qIndex)]: v };
        return;
      }
      const v = (await db.ref(`games/${pin}/${part}`).get()).val();
      if (v !== null && v !== undefined) (out as Record<string, unknown>)[part] = v;
    }),
  );
  return out;
}

/**
 * RTDB transaction on games/{pin}/state only. `validate` runs on the current state (throw to
 * abort). On success the state carries our lock, which freezes joins and answers (rules).
 */
export async function acquireLock(
  pin: string,
  by: LockAction,
  validate: (state: GameState, now: number) => void,
): Promise<{ state: GameState; lock: StateLock }> {
  const db = await database();
  let failure: unknown;
  let lock: StateLock | undefined;
  const res = await db.ref(`games/${pin}/state`).transaction(
    (current: GameState | null) => {
      failure = undefined;
      // The first attempt may run on an empty local cache: return it unchanged so the
      // server compares and re-runs us with the real data (aborting here would be wrong).
      if (current === null) return null;
      try {
        const now = Date.now();
        validate(current, now);
        const next = lockState(current, by, now);
        lock = next.lock;
        return next;
      } catch (e) {
        failure = e;
        return undefined; // abort
      }
    },
    undefined,
    false,
  );
  if (!res.committed) throw failure ?? new GameError("failed-precondition", "İşlem tamamlanamadı, tekrar deneyin.");
  const state = res.snapshot.val() as GameState | null;
  if (!state || !lock || !ownsLock(state, lock)) throw new GameError("not-found", "Oyun bulunamadı.");
  return { state, lock };
}

/** Best-effort: drops our lock (never someone else's) after a failed transition. */
export async function releaseLock(pin: string, lock: StateLock): Promise<void> {
  const db = await database();
  await db
    .ref(`games/${pin}/state`)
    .transaction((cur: GameState | null) => (cur === null ? null : unlockState(cur, lock)), undefined, false);
}

/** One atomic multi-path update relative to games/{pin}. Always clears the lock. */
export async function writePatch(pin: string, patch: Patch): Promise<void> {
  const db = await database();
  const full: Patch = { ...patch };
  if (!("state" in full)) full["state/lock"] = null;
  else if (full.state && typeof full.state === "object") {
    const { lock: _l, ...rest } = full.state as GameState;
    void _l;
    full.state = rest;
  }
  await db.ref(`games/${pin}`).update(full);
}

/** Private quiz snapshot (incl. correct answers) for a live game. */
export async function loadLiveQuiz(pin: string): Promise<Quiz | undefined> {
  const snap = await (await firestore()).doc(`liveGames/${pin}`).get();
  return snap.exists ? (snap.data() as LiveGameDoc).quiz : undefined;
}
