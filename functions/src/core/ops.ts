/**
 * Pure game transitions. Each `plan*` validates the room (as read inside an RTDB
 * transaction) and returns the multi-path patch to apply to games/{pin}.
 */
import type { GameState, Phase, Quiz } from "../../../shared/types";
import { scoreQuestion } from "../../../shared/scoring";
import { GameError } from "./errors";
import { assertTransition, type GameAction } from "./transitions";
import { answersFor, canReveal, questionPatch, type GameConfig, type Patch, type Room } from "./room";
import { leaderboardFrom, rankedResults } from "./archive";

export interface OpContext {
  uid: string;
  now: number;
  config: GameConfig;
  /** private quiz snapshot (liveGames/{pin}); needed by start/next/reveal */
  quiz?: Quiz;
}

type ActiveRoom = Room & Required<Pick<Room, "meta" | "state">>;

export function guard(room: Room | null | undefined, ctx: OpContext, action: GameAction): ActiveRoom {
  if (!room?.meta || !room.state) throw new GameError("not-found", "Oyun bulunamadı.");
  if (room.meta.hostUid !== ctx.uid) throw new GameError("permission-denied", "Bu oyunun sunucusu değilsiniz.");
  assertTransition(room.state.phase, action);
  return room as ActiveRoom;
}

function needQuiz(ctx: OpContext): Quiz {
  if (!ctx.quiz) throw new GameError("not-found", "Oyunun quiz verisi bulunamadı.");
  return ctx.quiz;
}

function idleState(phase: Phase, qIndex: number, now: number): GameState {
  return { phase, qIndex, startedAt: 0, endsAt: 0, updatedAt: now };
}

export function planStart(room: Room | null | undefined, ctx: OpContext): Patch {
  guard(room, ctx, "start");
  const quiz = needQuiz(ctx);
  const count = Object.keys(room!.players ?? {}).length;
  if (count < 1) throw new GameError("failed-precondition", "Başlatmak için en az bir oyuncu gerekli.");
  if (count > ctx.config.maxPlayers) {
    throw new GameError("failed-precondition", `En fazla ${ctx.config.maxPlayers} oyuncu katılabilir.`);
  }
  return questionPatch(quiz, 0, ctx.now, ctx.config.defaultQuestionSeconds);
}

export function planReveal(room: Room | null | undefined, ctx: OpContext): Patch {
  const r = guard(room, ctx, "reveal");
  const quiz = needQuiz(ctx);
  const { qIndex, startedAt, endsAt } = r.state;
  const q = quiz.questions[qIndex];
  if (!q) throw new GameError("failed-precondition", "Geçersiz soru.");
  if (!canReveal(r, ctx.now)) {
    throw new GameError("failed-precondition", "Süre dolmadan ve herkes cevaplamadan cevap gösterilemez.");
  }
  const { config } = ctx;
  const result = scoreQuestion({
    players: r.players ?? {},
    answers: answersFor(r, qIndex),
    correct: q.correct,
    optionCount: q.options.length,
    startedAt,
    durationMs: endsAt - startedAt,
    prevScores: r.scores ?? {},
    rules: { maxPoints: config.maxPoints, streakBonus: config.streakBonus },
    leaderboardSize: config.leaderboardSize,
  });
  return {
    reveal: { qIndex, correct: q.correct, counts: result.counts },
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
  return questionPatch(quiz, next, ctx.now, ctx.config.defaultQuestionSeconds);
}

export function planEnd(room: Room | null | undefined, ctx: OpContext): Patch {
  const r = guard(room, ctx, "end");
  const patch: Patch = { state: idleState("ended", r.state.qIndex, ctx.now) };
  if (!r.leaderboard) patch.leaderboard = leaderboardFrom(rankedResults(r), ctx.config.leaderboardSize);
  return patch;
}
