import { hasScores } from "./archive";
import type { Room } from "./room";

/**
 * keep: leave it; remove: delete it; archive-remove: save the result, then delete it;
 * end-archive: a started game nobody moves any more (host gone): save the result and flip it to
 * "ended" so the phones show the final screen; it is removed after the normal ended grace period.
 */
export type CleanupAction = "keep" | "remove" | "archive-remove" | "end-archive";

export interface CleanupOptions {
  /** ended rooms are removed this long after their last update */
  endedGraceMs: number;
  /** non-ended rooms idle this long are considered abandoned */
  abandonedMs: number;
  /** a started (question / reveal / leaderboard) game idle this long is ended */
  stuckMs: number;
}

export function classifyRoom(room: Room | null | undefined, now: number, opts: CleanupOptions): CleanupAction {
  if (!room?.meta && !room?.state) return "remove";
  // A lobby can be busy (joins, kicks, lock toggles) without any state change.
  const lastActivity = Math.max(room.state?.updatedAt ?? room.meta?.createdAt ?? 0, room.meta?.lastActivityAt ?? 0);
  const idle = now - lastActivity;
  const archived = room.meta?.archived === true;
  const phase = room.state?.phase;
  if (phase === "ended") {
    if (idle <= opts.endedGraceMs) return "keep";
    return archived || !room.meta ? "remove" : "archive-remove";
  }
  if (idle > opts.abandonedMs) return hasScores(room) && !archived ? "archive-remove" : "remove";
  // A lobby may wait for people as long as it likes (abandon window above); a started game may not.
  if (phase && phase !== "lobby" && room.meta && idle > opts.stuckMs) return "end-archive";
  return "keep";
}
