/** Pure logic for the RTDB join/leave triggers (games/{pin}/players/{uid}). */
import type { GameMeta, PlayerEntry } from "../../../shared/types";
import { activePlayers } from "./room";
import { sanitizePlayerNames } from "./sanitize";

/**
 * The name `uid` must get right after joining (blocked → "<prefix> N", case-insensitive duplicate
 * of an earlier joiner → " (2)"), or undefined when it can stay. Earlier joiners keep their names.
 */
export function joinRename(players: Record<string, PlayerEntry>, uid: string, prefix: string): string | undefined {
  const active = activePlayers({ players });
  if (!active[uid]) return undefined;
  return sanitizePlayerNames(active, prefix)[uid];
}

/** meta after one more player joined: count, full flag, last activity (max of join times). */
export function metaAfterJoin(meta: GameMeta, opts: { maxPlayers: number; joinedAt: number }): GameMeta {
  const playerCount = Math.max(0, meta.playerCount ?? 0) + 1;
  return {
    ...meta,
    playerCount,
    full: playerCount >= opts.maxPlayers,
    lastActivityAt: Math.max(meta.lastActivityAt ?? 0, opts.joinedAt),
  };
}

/** meta after a player left / was removed. */
export function metaAfterLeave(meta: GameMeta, opts: { maxPlayers: number }): GameMeta {
  const playerCount = Math.max(0, (meta.playerCount ?? 0) - 1);
  return { ...meta, playerCount, full: playerCount >= opts.maxPlayers };
}
