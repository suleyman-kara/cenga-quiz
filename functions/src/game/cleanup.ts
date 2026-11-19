/** Scheduled housekeeping core — plain async so tests can call it directly. */
import { club } from "../../../src/club.config";
import { buildGameResult, resultIdFor } from "../core/archive";
import { classifyRoom, type CleanupOptions } from "../core/cleanup";
import type { Room } from "../core/room";
import { logger } from "firebase-functions/logger";
import { database, firestore } from "./firebase";

const MIN = 60_000;

export const cleanupOptions: CleanupOptions = {
  endedGraceMs: 30 * MIN,
  abandonedMs: club.game.abandonedAfterHours * 60 * MIN,
};

export interface CleanupSummary {
  removed: number;
  archived: number;
  orphanSnapshots: number;
  /** rooms / snapshots that threw: logged and skipped, retried on the next run */
  failed: number;
}

export async function runCleanup(now: number, opts: CleanupOptions = cleanupOptions): Promise<CleanupSummary> {
  const [db, fs] = await Promise.all([database(), firestore()]);
  const summary: CleanupSummary = { removed: 0, archived: 0, orphanSnapshots: 0, failed: 0 };

  // A club runs only a handful of rooms at once, so reading them all is fine and needs no index.
  const snap = await db.ref("games").get();
  const rooms = (snap.val() ?? {}) as Record<string, Room | null>;

  // One broken room (or snapshot) must not stop the housekeeping of all the others.
  for (const [pin, room] of Object.entries(rooms)) {
    try {
      const action = classifyRoom(room, now, opts);
      if (action === "keep") continue;
      if (action === "archive-remove") {
        // Deterministic id + set(): a result already written by a crashed endGame is overwritten, never duplicated.
        const doc = buildGameResult(room!, { pin, now, retentionDays: club.game.resultsRetentionDays });
        await fs.doc(`gameResults/${resultIdFor(pin, room!)}`).set(doc);
        summary.archived++;
      }
      await Promise.all([db.ref(`games/${pin}`).remove(), fs.doc(`liveGames/${pin}`).delete()]);
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
