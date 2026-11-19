/** Pure scoring logic shared by Cloud Functions (authoritative) and the client (display). */
import type { AnswerEntry, Leaderboard, LeaderboardEntry, PlayerEntry, PlayerScore } from "./types";

export interface ScoringRules {
  maxPoints: number;
  /**
   * steps[i] = bonus for a streak of i + 2 consecutive correct answers (the first correct
   * answer has no bonus); longer streaks keep the last step. Increments should shrink.
   */
  streakBonus: { enabled: boolean; steps: readonly number[] };
}

export function emptyScore(): PlayerScore {
  return { score: 0, streak: 0, rank: 0, lastDelta: 0, lastCorrect: false, lastAnswered: false, correctCount: 0 };
}

/** maxPoints × (1 − elapsed/duration/2), rounded. elapsed<0 → 0. elapsed>duration → 0 (late). */
export function questionPoints(elapsedMs: number, durationMs: number, maxPoints: number): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(durationMs) || !Number.isFinite(maxPoints)) return 0;
  if (durationMs <= 0) return 0;
  const elapsed = Math.max(0, elapsedMs);
  if (elapsed > durationMs) return 0;
  return Math.round(maxPoints * (1 - elapsed / durationMs / 2));
}

/** streak = consecutive corrects INCLUDING this one. */
export function streakBonus(streak: number, rules: ScoringRules): number {
  const { enabled, steps } = rules.streakBonus;
  if (!enabled || !(streak > 1) || steps.length === 0) return 0;
  const v = steps[Math.min(Math.floor(streak) - 2, steps.length - 1)];
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** uids sorted by score desc, then name, then uid (code-unit order: deterministic across runtimes). */
function orderUids(scores: Record<string, PlayerScore>, players: Record<string, PlayerEntry>): string[] {
  return Object.keys(scores).sort(
    (a, b) =>
      scores[b].score - scores[a].score ||
      compareKeys(players[a]?.name ?? "", players[b]?.name ?? "") ||
      compareKeys(a, b),
  );
}

/**
 * Competition ranking (1,1,3). The returned record's key order is the display order
 * (ties ordered by name then uid). Note: integer-like keys would be reordered by JS; uids never are.
 */
export function rankScores(
  scores: Record<string, PlayerScore>,
  players: Record<string, PlayerEntry>,
): Record<string, PlayerScore> {
  const out: Record<string, PlayerScore> = {};
  const order = orderUids(scores, players);
  let prevScore: number | undefined;
  let rank = 0;
  // display index of the first player in the current score group / previous group
  let groupStart = 0;
  let prevGroupStart = -1;
  order.forEach((uid, i) => {
    const { aheadName, aheadGap, leadGap, ...s } = scores[uid];
    if (s.score !== prevScore) {
      rank = i + 1;
      prevScore = s.score;
      prevGroupStart = i === 0 ? -1 : groupStart;
      groupStart = i;
    }
    const row: PlayerScore = { ...s, rank };
    if (prevGroupStart >= 0) {
      const ahead = order[prevGroupStart];
      row.aheadName = players[ahead]?.name ?? "";
      row.aheadGap = scores[ahead].score - s.score;
    } else {
      const below = order.find((u) => scores[u].score < s.score);
      if (below !== undefined) row.leadGap = s.score - scores[below].score;
    }
    out[uid] = row;
  });
  return out;
}

export interface ScoreQuestionInput {
  players: Record<string, PlayerEntry>;
  /** may contain uids not in players → ignored; invalid choice → ignored */
  answers: Record<string, AnswerEntry>;
  correct: number;
  optionCount: number;
  startedAt: number;
  durationMs: number;
  /** missing → fresh zero score */
  prevScores: Record<string, PlayerScore>;
  rules: ScoringRules;
  leaderboardSize: number;
}

export interface ScoreQuestionResult {
  scores: Record<string, PlayerScore>;
  counts: number[];
  leaderboard: Leaderboard;
}

function validAnswer(a: unknown, optionCount: number): a is AnswerEntry {
  if (!a || typeof a !== "object") return false;
  const { choice, at } = a as Record<string, unknown>;
  return (
    typeof choice === "number" &&
    Number.isInteger(choice) &&
    choice >= 0 &&
    choice < optionCount &&
    typeof at === "number" &&
    Number.isFinite(at)
  );
}

export function scoreQuestion(input: ScoreQuestionInput): ScoreQuestionResult {
  const { players, answers, correct, optionCount, startedAt, durationMs, prevScores, rules, leaderboardSize } = input;
  const counts: number[] = Array.from({ length: Math.max(0, Math.floor(optionCount)) }, () => 0);
  const next: Record<string, PlayerScore> = {};

  for (const uid of Object.keys(players)) {
    const prev = { ...emptyScore(), ...(prevScores?.[uid] ?? {}) };
    const a = answers?.[uid];
    const answered = validAnswer(a, counts.length);
    let delta = 0;
    let isCorrect = false;
    let streak = 0;

    if (answered) {
      counts[a.choice]++;
      if (a.choice === correct) {
        const base = questionPoints(a.at - startedAt, durationMs, rules.maxPoints);
        if (base > 0) {
          isCorrect = true;
          streak = prev.streak + 1;
          delta = base + streakBonus(streak, rules);
        }
      }
    }

    next[uid] = {
      score: prev.score + delta,
      streak,
      rank: 0,
      lastDelta: delta,
      lastCorrect: isCorrect,
      lastAnswered: answered,
      correctCount: prev.correctCount + (isCorrect ? 1 : 0),
    };
  }

  const scores = rankScores(next, players);
  // Order explicitly rather than via object key order (integer-like keys would be reordered by JS).
  const top: LeaderboardEntry[] = orderUids(scores, players)
    .slice(0, Math.max(0, leaderboardSize))
    .map((uid) => ({
      name: players[uid].name,
      score: scores[uid].score,
      rank: scores[uid].rank,
      correctCount: scores[uid].correctCount,
    }));

  return { scores, counts, leaderboard: { top, playerCount: Object.keys(players).length } };
}
