import { hasScores } from "./archive";
import type { Room } from "./room";

export type CleanupAction = "keep" | "remove" | "archive-remove";

export interface CleanupOptions {
  /** ended rooms are removed this long after their last update */
  endedGraceMs: number;
  /** non-ended rooms idle this long are considered abandoned */
  abandonedMs: number;
}

export function classifyRoom(room: Room | null | undefined, now: number, opts: CleanupOptions): CleanupAction {
  if (!room?.meta && !room?.state) return "remove";
  // A lobby can be busy (joins, kicks, lock toggles) without any state change.
  const lastActivity = Math.max(room.state?.updatedAt ?? room.meta?.createdAt ?? 0, room.meta?.lastActivityAt ?? 0);
  const idle = now - lastActivity;
  const archived = room.meta?.archived === true;
  if (room.state?.phase === "ended") {
    if (idle <= opts.endedGraceMs) return "keep";
    return archived || !room.meta ? "remove" : "archive-remove";
  }
  if (idle > opts.abandonedMs) return hasScores(room) && !archived ? "archive-remove" : "remove";
  return "keep";
}
