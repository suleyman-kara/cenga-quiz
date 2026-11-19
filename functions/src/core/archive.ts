import type { GameResultDoc, Leaderboard, PlayerScore } from "../../../shared/types";
import { emptyScore, rankScores } from "../../../shared/scoring";
import type { Room } from "./room";

export type ResultRow = GameResultDoc["results"][number];

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Every joined player with their final score, sorted by rank (ties: name, then uid). */
export function rankedResults(room: Room): ResultRow[] {
  const players = room.players ?? {};
  const scores: Record<string, PlayerScore> = {};
  for (const uid of Object.keys(players)) scores[uid] = { ...emptyScore(), ...(room.scores?.[uid] ?? {}) };
  const ranked = rankScores(scores, players);
  return Object.entries(ranked)
    .map(([uid, s]) => ({ uid, name: players[uid].name, score: s.score, rank: s.rank, correctCount: s.correctCount }))
    .sort((a, b) => a.rank - b.rank || cmp(a.name, b.name) || cmp(a.uid, b.uid));
}

export function leaderboardFrom(rows: ResultRow[], size: number): Leaderboard {
  return {
    top: rows.slice(0, Math.max(0, size)).map(({ name, score, rank }) => ({ name, score, rank })),
    playerCount: rows.length,
  };
}

export function hasScores(room: Room): boolean {
  return Object.keys(room.scores ?? {}).length > 0;
}

/** Firestore gameResults/{id} document for a finished (or abandoned) room. */
export function buildGameResult(room: Room, opts: { pin: string; now: number }): GameResultDoc {
  const meta = room.meta;
  return {
    pin: opts.pin,
    hostUid: meta?.hostUid ?? "",
    quizId: meta?.quizId ?? "",
    title: meta?.title ?? "",
    createdAt: meta?.createdAt ?? 0,
    endedAt: opts.now,
    playerCount: Object.keys(room.players ?? {}).length,
    questionCount: meta?.questionCount ?? 0,
    results: rankedResults(room),
  };
}
