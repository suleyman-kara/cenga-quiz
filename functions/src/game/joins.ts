/** IO side of the join/leave database triggers on games/{pin}/players/{uid}. */
import type { GameMeta, PlayerEntry } from "../../../shared/types";
import { joinRename, metaAfterJoin, metaAfterLeave } from "../core/joins";
import { gameConfig, namePrefix } from "./config";
import { database } from "./firebase";

/**
 * Transaction that only ever changes an existing node: a room/player removed meanwhile stays
 * removed. (The first run may see an empty local cache: returning null unchanged lets the
 * server compare and re-run with the real value.)
 */
async function updateIfExists<T>(path: string, change: (cur: T) => T | undefined): Promise<void> {
  const db = await database();
  await db.ref(path).transaction((cur: T | null) => (cur === null ? null : change(cur)), undefined, false);
}

export async function onPlayerJoined(pin: string, uid: string, entry: unknown): Promise<void> {
  const joinedAt = (entry as Partial<PlayerEntry> | null)?.joinedAt;
  await updateIfExists<GameMeta>(`games/${pin}/meta`, (meta) =>
    metaAfterJoin(meta, {
      maxPlayers: gameConfig.maxPlayers,
      joinedAt: typeof joinedAt === "number" ? joinedAt : Date.now(),
    }),
  );
  // Names are fixed right away, so the lobby screen never shows a blocked name for long.
  const db = await database();
  const players = ((await db.ref(`games/${pin}/players`).get()).val() ?? {}) as Record<string, PlayerEntry>;
  const original = players[uid]?.name;
  const name = joinRename(players, uid, namePrefix);
  if (name === undefined) return;
  await updateIfExists<PlayerEntry>(`games/${pin}/players/${uid}`, (cur) =>
    cur.name === original ? { ...cur, name } : undefined,
  );
}

export async function onPlayerLeft(pin: string): Promise<void> {
  await updateIfExists<GameMeta>(`games/${pin}/meta`, (meta) =>
    metaAfterLeave(meta, { maxPlayers: gameConfig.maxPlayers }),
  );
}
