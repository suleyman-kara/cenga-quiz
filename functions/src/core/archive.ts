import type { GameResultDoc, Leaderboard, PlayerScore } from "../../../shared/types";
import { emptyScore, leaderboardEntry, rankScores } from "../../../shared/scoring";
import { activePlayers, type Room } from "./room";

export type ResultRow = GameResultDoc["results"][number];

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Every active player (see activePlayers) with their final score, sorted by rank (ties: name, then uid). */
export function rankedResults(room: Room): ResultRow[] {
  const players = activePlayers(room);
  const scores: Record<string, PlayerScore> = {};
  for (const uid of Object.keys(players)) scores[uid] = { ...emptyScore(), ...(room.scores?.[uid] ?? {}) };
  const ranked = rankScores(scores, players);
  return Object.entries(ranked)
    .map(([uid, s]) => ({ uid, name: players[uid].name, score: s.score, rank: s.rank, correctCount: s.correctCount }))
    .sort((a, b) => a.rank - b.rank || cmp(a.name, b.name) || cmp(a.uid, b.uid));
}

/**
 * Top-`size` leaderboard from ranked rows. With `scores` (the stored scores of the last scored
 * question) each entry keeps that question's prevRank / streak; the rank itself always comes from
 * `rows`, so a stale stored rank never leaks in.
 */
export function leaderboardFrom(rows: ResultRow[], size: number, scores?: Record<string, PlayerScore>): Leaderboard {
  return {
    top: rows.slice(0, Math.max(0, size)).map(({ uid, name, score, rank, correctCount }) => {
      const stored = scores?.[uid];
      return stored
        ? leaderboardEntry(name, { ...emptyScore(), ...stored, score, rank, correctCount })
        : { name, score, rank, correctCount };
    }),
    playerCount: rows.length,
  };
}

export function hasScores(room: Room): boolean {
  return Object.keys(room.scores ?? {}).length > 0;
}

const DAY_MS = 86_400_000;

/** Deterministic gameResults doc id: retries and cleanup overwrite instead of duplicating. */
export function resultIdFor(pin: string, room: Pick<Room, "meta">): string {
  return `${pin}_${room.meta?.createdAt ?? 0}`;
}

/** Firestore gameResults/{id} document for a finished (or abandoned) room. */
export function buildGameResult(room: Room, opts: { pin: string; now: number; retentionDays: number }): GameResultDoc {
  const meta = room.meta;
  return {
    pin: opts.pin,
    hostUid: meta?.hostUid ?? "",
    quizId: meta?.quizId ?? "",
    title: meta?.title ?? "",
    createdAt: meta?.createdAt ?? 0,
    endedAt: opts.now,
    playerCount: Object.keys(activePlayers(room)).length,
    questionCount: meta?.questionCount ?? 0,
    expireAt: new Date(opts.now + opts.retentionDays * DAY_MS),
    results: rankedResults(room),
  };
}
