/** Scheduled housekeeping core — plain async so tests can call it directly. */
import { club } from "../../../src/club.config";
import { buildGameResult, resultIdFor } from "../core/archive";
import { classifyRoom, type CleanupOptions } from "../core/cleanup";
import { planEnd } from "../core/ops";
import { applyPatch, type Room } from "../core/room";
import { logger } from "firebase-functions/logger";
import type { Database } from "firebase-admin/database";
import { gameConfig } from "./config";
import { database, firestore } from "./firebase";
import { writePatch } from "./rooms";

const MIN = 60_000;

export const cleanupOptions: CleanupOptions = {
  endedGraceMs: 30 * MIN,
  abandonedMs: club.game.abandonedAfterHours * 60 * MIN,
  stuckMs: 30 * MIN,
};

/** Set once every room that existed before the index was introduced is in gameIndex. */
const INDEX_FLAG = "system/gameIndexV1";

export interface CleanupSummary {
  removed: number;
  archived: number;
  /** started games nobody moved for stuckMs: archived and flipped to "ended" */
  ended: number;
  orphanSnapshots: number;
  /** rooms / snapshots that threw: logged and skipped, retried on the next run */
  failed: number;
}

/**
 * PINs to visit. gameIndex/{pin} is written by createGame, so the job reads a few bytes per room
 * instead of every room's players, answers and scores. The first run after the index was
 * introduced reads the games tree once to index older rooms.
 */
async function roomPins(db: Database, now: number): Promise<string[]> {
  const [indexSnap, flag] = await Promise.all([db.ref("gameIndex").get(), db.ref(INDEX_FLAG).get()]);
  const indexed = Object.keys(indexSnap.val() ?? {});
  if (flag.val() === true) return indexed;
  const legacy = Object.keys((await db.ref("games").get()).val() ?? {});
  const missing = legacy.filter((pin) => !indexed.includes(pin));
  if (missing.length > 0) await db.ref("gameIndex").update(Object.fromEntries(missing.map((pin) => [pin, now])));
  await db.ref(INDEX_FLAG).set(true);
  return [...new Set([...indexed, ...legacy])];
}

async function removeRoom(db: Database, pin: string): Promise<void> {
  const fs = await firestore();
  await Promise.all([
    db.ref(`games/${pin}`).remove(),
    db.ref(`nameClaims/${pin}`).remove(),
    fs.doc(`liveGames/${pin}`).delete(),
  ]);
  // last: if anything above failed, the next run still finds the room through the index
  await db.ref(`gameIndex/${pin}`).remove();
}

export async function runCleanup(now: number, opts: CleanupOptions = cleanupOptions): Promise<CleanupSummary> {
  const [db, fs] = await Promise.all([database(), firestore()]);
  const summary: CleanupSummary = { removed: 0, archived: 0, ended: 0, orphanSnapshots: 0, failed: 0 };

  // One broken room (or snapshot) must not stop the housekeeping of all the others.
  for (const pin of await roomPins(db, now)) {
    try {
      // meta + state decide; the whole room is read only when it is archived
      const [meta, state] = await Promise.all([db.ref(`games/${pin}/meta`).get(), db.ref(`games/${pin}/state`).get()]);
      const head: Room = { meta: meta.val() ?? undefined, state: state.val() ?? undefined };
      let action = classifyRoom(head, now, opts);
      if (action === "keep") continue;
      let room = head;
      if (action !== "remove" || head.meta) {
        room = ((await db.ref(`games/${pin}`).get()).val() ?? {}) as Room;
        action = classifyRoom(room, now, opts); // scores decide archive vs plain remove
      }
      if (action === "keep") continue;
      if (action === "end-archive") {
        const patch = planEnd(room, { uid: room.meta!.hostUid, now, config: gameConfig });
        if (room.meta?.archived !== true) {
          const doc = buildGameResult(applyPatch(room, patch), { pin, now, retentionDays: club.game.resultsRetentionDays });
          await fs.doc(`gameResults/${resultIdFor(pin, room)}`).set(doc);
          summary.archived++;
        }
        patch["meta/archived"] = true;
        await writePatch(pin, patch);
        await fs.doc(`liveGames/${pin}`).delete();
        summary.ended++;
        logger.info("cleanupGames: ended a stuck game", { pin, phase: room.state?.phase });
        continue;
      }
      if (action === "archive-remove") {
        // Deterministic id + set(): a result already written by a crashed endGame is overwritten, never duplicated.
        const doc = buildGameResult(room, { pin, now, retentionDays: club.game.resultsRetentionDays });
        await fs.doc(`gameResults/${resultIdFor(pin, room)}`).set(doc);
        summary.archived++;
      }
      await removeRoom(db, pin);
      summary.removed++;
    } catch (e) {
      summary.failed++;
      logger.error(`cleanupGames: room ${pin} skipped`, e);
    }
  }
  // Private snapshots whose room no longer exists (e.g. a half-finished createGame).
  const stale = await fs.collection("liveGames").where("createdAt", "<", now - opts.abandonedMs).get();
  for (const doc of stale.docs) {
    try {
      const exists = (await db.ref(`games/${doc.id}/meta`).get()).exists();
      if (!exists) {
        await doc.ref.delete();
        summary.orphanSnapshots++;
      }
    } catch (e) {
      summary.failed++;
      logger.error(`cleanupGames: snapshot liveGames/${doc.id} skipped`, e);
    }
  }
  return summary;
}
