import type { Quiz, LiveGameDoc } from "../../../shared/types";
import { GameError } from "../core/errors";
import { applyPatch, type Patch, type Room } from "../core/room";
import { database, firestore } from "./firebase";

/**
 * Runs `plan` inside an RTDB transaction on games/{pin} so that guards (phase, answers)
 * and the resulting multi-path write are atomic — e.g. two concurrent reveals cannot
 * both score. Returns the committed room.
 */
export async function transactRoom(pin: string, plan: (room: Room, now: number) => Patch): Promise<Room> {
  const db = await database();
  let failure: unknown;
  const res = await db.ref(`games/${pin}`).transaction(
    (current: Room | null) => {
      failure = undefined;
      // The first attempt may run on an empty local cache: return it unchanged so the
      // server compares and re-runs us with the real data (aborting here would be wrong).
      if (current === null) return null;
      try {
        return applyPatch(current, plan(current, Date.now()));
      } catch (e) {
        failure = e;
        return undefined; // abort
      }
    },
    undefined,
    false,
  );
  if (!res.committed) throw failure ?? new GameError("failed-precondition", "İşlem tamamlanamadı, tekrar deneyin.");
  const room = res.snapshot.val() as Room | null;
  if (!room) throw new GameError("not-found", "Oyun bulunamadı.");
  return room;
}

/** Private quiz snapshot (incl. correct answers) for a live game. */
export async function loadLiveQuiz(pin: string): Promise<Quiz | undefined> {
  const snap = await (await firestore()).doc(`liveGames/${pin}`).get();
  return snap.exists ? (snap.data() as LiveGameDoc).quiz : undefined;
}
