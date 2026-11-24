/**
 * Pure game transitions. Each `plan*` validates the room (as read inside an RTDB
 * transaction) and returns the multi-path patch to apply to games/{pin}.
 */
import type { GameState, Phase, Quiz } from "../../../shared/types";
import { doublePointsApplies, scoreQuestion } from "../../../shared/scoring";
import { GameError } from "./errors";
import { assertTransition, type GameAction } from "./transitions";
import {
  activePlayers,
  answersFor,
  canReveal,
  purgeInactivePlayers,
  questionPatch,
  type GameConfig,
  type Patch,
  type Room,
} from "./room";
import { leaderboardFrom, rankedResults } from "./archive";
import { joinOrder, sanitizePlayerNames } from "./sanitize";

export interface OpContext {
  uid: string;
  now: number;
  config: GameConfig;
  /** private quiz snapshot (liveGames/{pin}); needed by start/next/reveal */
  quiz?: Quiz;
  /** prefix for generated replacement names ("Oyuncu" → "Oyuncu 3") */
  namePrefix?: string;
}

type ActiveRoom = Room & Required<Pick<Room, "meta" | "state">>;

/** The room exists and the caller is its host. */
export function assertHost(room: Room | null | undefined, uid: string): ActiveRoom {
  if (!room?.meta || !room.state) throw new GameError("not-found", "Oyun bulunamadı.");
  if (room.meta.hostUid !== uid) throw new GameError("permission-denied", "Bu oyunun sunucusu değilsiniz.");
  return room as ActiveRoom;
}

export function guard(room: Room | null | undefined, ctx: OpContext, action: GameAction): ActiveRoom {
  const r = assertHost(room, ctx.uid);
  assertTransition(r.state.phase, action);
  return r;
}

function needQuiz(ctx: OpContext): Quiz {
  if (!ctx.quiz) throw new GameError("not-found", "Oyunun quiz verisi bulunamadı.");
  return ctx.quiz;
}

function idleState(phase: Phase, qIndex: number, now: number): GameState {
  return { phase, qIndex, startedAt: 0, endsAt: 0, updatedAt: now };
}

function showQuestion(quiz: Quiz, index: number, ctx: OpContext): Patch {
  const { defaultQuestionSeconds, leadInMs, doublePointsLastN } = ctx.config;
  return questionPatch(quiz, index, ctx.now, defaultQuestionSeconds, leadInMs, doublePointsLastN);
}

export function planStart(room: Room | null | undefined, ctx: OpContext): Patch {
  const r = guard(room, ctx, "start");
  const quiz = needQuiz(ctx);
  // Banned uids / partial entries never count and are dropped.
  const players = activePlayers(r);
  const order = joinOrder(players);
  if (order.length < 1) throw new GameError("failed-precondition", "Başlatmak için en az bir oyuncu gerekli.");
  const patch: Patch = purgeInactivePlayers(r);
  // Over capacity: keep the earliest joiners rather than failing the start.
  const kept = order.slice(0, Math.max(0, ctx.config.maxPlayers));
  for (const uid of order.slice(kept.length)) patch[`players/${uid}`] = null;
  // The join/leave triggers count with increments; recount here so a lost event cannot leave
  // meta.playerCount / meta.full wrong for the rest of the game.
  patch["meta/playerCount"] = kept.length;
  patch["meta/full"] = kept.length >= ctx.config.maxPlayers;
  // Final display names: blocked → neutral generated name, duplicates suffixed.
  const keptPlayers = Object.fromEntries(kept.map((uid) => [uid, players[uid]]));
  // Whole objects, never `players/{uid}/name`: a child path would re-create a removed player
  // as a partial entry. Only uids read (under the lock) as active players are written.
  for (const [uid, name] of Object.entries(sanitizePlayerNames(keptPlayers, ctx.namePrefix ?? "Oyuncu"))) {
    patch[`players/${uid}`] = { name, joinedAt: players[uid].joinedAt };
  }
  return { ...patch, ...showQuestion(quiz, 0, ctx) };
}

export function planReveal(room: Room | null | undefined, ctx: OpContext): Patch {
  const r = guard(room, ctx, "reveal");
  const quiz = needQuiz(ctx);
  const { qIndex, startedAt, endsAt } = r.state;
  const q = quiz.questions[qIndex];
  if (!q) throw new GameError("failed-precondition", "Geçersiz soru.");
  if (!canReveal(r, ctx.now)) {
    throw new GameError("failed-precondition", "Cevaplama başlamadan cevap gösterilemez.");
  }
  const { config } = ctx;
  const result = scoreQuestion({
    players: activePlayers(r),
    answers: answersFor(r, qIndex),
    correct: q.correct,
    optionCount: q.options.length,
    startedAt,
    durationMs: endsAt - startedAt,
    prevScores: r.scores ?? {},
    rules: { maxPoints: config.maxPoints, streakBonus: config.streakBonus },
    leaderboardSize: config.leaderboardSize,
    multiplier: doublePointsApplies(qIndex, quiz.questions.length, config.doublePointsLastN) ? 2 : 1,
  });
  return {
    ...purgeInactivePlayers(r),
    reveal: { qIndex, correct: q.correct, counts: result.counts },
    // a few bytes per question, so the archive can say which questions were hard
    [`stats/${qIndex}`]: { text: q.text, correct: q.correct, counts: result.counts, players: Object.keys(activePlayers(r)).length },
    scores: result.scores,
    leaderboard: result.leaderboard,
    state: idleState("reveal", qIndex, ctx.now),
  };
}

export function planShowLeaderboard(room: Room | null | undefined, ctx: OpContext): Patch {
  const r = guard(room, ctx, "showLeaderboard");
  return { state: idleState("leaderboard", r.state.qIndex, ctx.now) };
}

export function planNext(room: Room | null | undefined, ctx: OpContext): Patch {
  const r = guard(room, ctx, "next");
  const quiz = needQuiz(ctx);
  const next = r.state.qIndex + 1;
  if (next >= quiz.questions.length) throw new GameError("failed-precondition", "Başka soru kalmadı.");
  return showQuestion(quiz, next, ctx);
}

export function planEnd(room: Room | null | undefined, ctx: OpContext): Patch {
  const r = guard(room, ctx, "end");
  const patch: Patch = { state: idleState("ended", r.state.qIndex, ctx.now) };
  if (!r.leaderboard) patch.leaderboard = leaderboardFrom(rankedResults(r), ctx.config.leaderboardSize);
  return patch;
}

/** Removes a player (and their score) and bans their uid from rejoining. */
export function planKick(room: Room | null | undefined, ctx: OpContext, target: string): Patch {
  return planKickMany(room, ctx, [target]);
}

/** Removes players (and their scores) and bans their uids, in one patch. */
export function planKickMany(room: Room | null | undefined, ctx: OpContext, targets: readonly string[]): Patch {
  const r = guard(room, ctx, "kick");
  const patch: Patch = { "meta/lastActivityAt": ctx.now };
  // A ban is per (anonymous) uid: a kicked player could sign in again and rejoin. Kicking in the
  // lobby therefore closes it; the host reopens it with one click if needed.
  if (r.state.phase === "lobby") patch["meta/locked"] = true;
  for (const t of targets) Object.assign(patch, { [`players/${t}`]: null, [`scores/${t}`]: null, [`banned/${t}`]: true });
  if (r.leaderboard) {
    // Keep the big screen clean: rebuild the leaderboard (and ranks) without the kicked players.
    const banned: Record<string, true> = { ...(r.banned ?? {}) };
    for (const t of targets) banned[t] = true;
    const scores = { ...(r.scores ?? {}) };
    for (const t of targets) delete scores[t];
    const rows = rankedResults({ ...r, banned, scores });
    for (const row of rows) {
      if (scores[row.uid] && scores[row.uid].rank !== row.rank) patch[`scores/${row.uid}/rank`] = row.rank;
    }
    // movement / streak of the last scored question stay on the rebuilt board
    patch.leaderboard = leaderboardFrom(rows, ctx.config.leaderboardSize, scores);
  }
  return patch;
}

export function planSetLobbyLocked(room: Room | null | undefined, ctx: OpContext, locked: boolean): Patch {
  guard(room, ctx, "lockLobby");
  return { "meta/locked": locked, "meta/lastActivityAt": ctx.now };
}
