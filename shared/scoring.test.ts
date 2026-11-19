import { describe, it, expect } from "vitest";
import type { AnswerEntry, PlayerEntry, PlayerScore } from "./types";
import {
  questionPoints,
  streakBonus,
  scoreQuestion,
  rankScores,
  emptyScore,
  type ScoringRules,
  type ScoreQuestionInput,
} from "./scoring";

const RULES: ScoringRules = { maxPoints: 1000, streakBonus: { enabled: true, perStreak: 100, max: 500 } };
const NO_STREAK: ScoringRules = { maxPoints: 1000, streakBonus: { enabled: false, perStreak: 100, max: 500 } };

const T0 = 1_700_000_000_000;
const DUR = 20_000;

function player(name: string, joinedAt = T0 - 60_000): PlayerEntry {
  return { name, joinedAt };
}
function ans(choice: number, elapsed: number): AnswerEntry {
  return { choice, at: T0 + elapsed };
}
function score(p: Partial<PlayerScore>): PlayerScore {
  return { ...emptyScore(), ...p };
}
function input(p: Partial<ScoreQuestionInput>): ScoreQuestionInput {
  return {
    players: {},
    answers: {},
    correct: 0,
    optionCount: 4,
    startedAt: T0,
    durationMs: DUR,
    prevScores: {},
    rules: RULES,
    leaderboardSize: 5,
    ...p,
  };
}

describe("emptyScore", () => {
  it("is a fresh zero score", () => {
    expect(emptyScore()).toEqual({
      score: 0,
      streak: 0,
      rank: 0,
      lastDelta: 0,
      lastCorrect: false,
      lastAnswered: false,
      correctCount: 0,
    });
  });

  it("returns a new object each time", () => {
    const a = emptyScore();
    a.score = 99;
    expect(emptyScore().score).toBe(0);
  });
});

describe("questionPoints", () => {
  it("instant answer gets maxPoints", () => {
    expect(questionPoints(0, DUR, 1000)).toBe(1000);
  });

  it("answer at the very end gets half", () => {
    expect(questionPoints(DUR, DUR, 1000)).toBe(500);
  });

  it("answer at half time gets 750", () => {
    expect(questionPoints(DUR / 2, DUR, 1000)).toBe(750);
  });

  it("is rounded to an integer", () => {
    // 1000 * (1 - 1/3/2) = 833.33…
    expect(questionPoints(1000, 3000, 1000)).toBe(833);
    // 1000 * (1 - 1/1000/2) = 999.5 → rounds up
    expect(questionPoints(1, 1000, 1000)).toBe(1000); // 999.5 → 1000
    expect(Number.isInteger(questionPoints(1234, 7777, 1000))).toBe(true);
  });

  it("negative elapsed (clock skew) is treated as 0", () => {
    expect(questionPoints(-500, DUR, 1000)).toBe(1000);
  });

  it("late answer (elapsed > duration) gets 0", () => {
    expect(questionPoints(DUR + 1, DUR, 1000)).toBe(0);
  });

  it("scales with maxPoints", () => {
    expect(questionPoints(0, DUR, 2000)).toBe(2000);
    expect(questionPoints(DUR, DUR, 2000)).toBe(1000);
  });

  it("non-positive duration or non-finite input gives 0", () => {
    expect(questionPoints(0, 0, 1000)).toBe(0);
    expect(questionPoints(0, -1, 1000)).toBe(0);
    expect(questionPoints(NaN, DUR, 1000)).toBe(0);
  });
});

describe("streakBonus", () => {
  it("first correct answer (streak 1) has no bonus", () => {
    expect(streakBonus(1, RULES)).toBe(0);
  });

  it("grows by perStreak per consecutive correct", () => {
    expect(streakBonus(2, RULES)).toBe(100);
    expect(streakBonus(3, RULES)).toBe(200);
    expect(streakBonus(6, RULES)).toBe(500);
  });

  it("is capped at max", () => {
    expect(streakBonus(7, RULES)).toBe(500);
    expect(streakBonus(100, RULES)).toBe(500);
  });

  it("is 0 when disabled", () => {
    expect(streakBonus(5, NO_STREAK)).toBe(0);
  });

  it("is 0 for streak 0 or negative", () => {
    expect(streakBonus(0, RULES)).toBe(0);
    expect(streakBonus(-3, RULES)).toBe(0);
  });
});

describe("rankScores", () => {
  const players = {
    a: player("Ayşe"),
    b: player("Bora"),
    c: player("Cem"),
    d: player("Deniz"),
  };

  it("uses competition ranking (1,1,3)", () => {
    const r = rankScores(
      { a: score({ score: 500 }), b: score({ score: 900 }), c: score({ score: 900 }), d: score({ score: 100 }) },
      players,
    );
    expect(r.b.rank).toBe(1);
    expect(r.c.rank).toBe(1);
    expect(r.a.rank).toBe(3);
    expect(r.d.rank).toBe(4);
  });

  it("everyone at 0 shares rank 1", () => {
    const r = rankScores({ a: score({}), b: score({}) }, players);
    expect(r.a.rank).toBe(1);
    expect(r.b.rank).toBe(1);
  });

  it("does not mutate the input", () => {
    const s = { a: score({ score: 1, rank: 7 }) };
    rankScores(s, players);
    expect(s.a.rank).toBe(7);
  });

  it("preserves other fields", () => {
    const r = rankScores({ a: score({ score: 10, streak: 2, correctCount: 3, lastDelta: 10 }) }, players);
    expect(r.a).toEqual(score({ score: 10, streak: 2, correctCount: 3, lastDelta: 10, rank: 1 }));
  });

  it("orders ties by name then uid (insertion order of the result)", () => {
    const r = rankScores(
      {
        z: score({ score: 100 }),
        y: score({ score: 100 }),
        x: score({ score: 200 }),
      },
      { z: player("Ali"), y: player("Ali"), x: player("Zeynep") },
    );
    expect(Object.keys(r)).toEqual(["x", "y", "z"]);
  });

  it("handles empty input", () => {
    expect(rankScores({}, {})).toEqual({});
  });
});

describe("scoreQuestion", () => {
  it("gives every player an entry, even without an answer", () => {
    const res = scoreQuestion(input({ players: { a: player("A"), b: player("B") } }));
    expect(Object.keys(res.scores).sort()).toEqual(["a", "b"]);
    expect(res.scores.a).toEqual(score({ rank: 1 }));
    expect(res.scores.b.lastAnswered).toBe(false);
  });

  it("correct answer scores time-based points; first correct has no bonus", () => {
    const res = scoreQuestion(
      input({ players: { a: player("A") }, answers: { a: ans(2, DUR / 2) }, correct: 2 }),
    );
    expect(res.scores.a).toEqual({
      score: 750,
      streak: 1,
      rank: 1,
      lastDelta: 750,
      lastCorrect: true,
      lastAnswered: true,
      correctCount: 1,
    });
  });

  it("wrong answer: delta 0, streak reset, answered true, score kept", () => {
    const res = scoreQuestion(
      input({
        players: { a: player("A") },
        answers: { a: ans(1, 1000) },
        correct: 2,
        prevScores: { a: score({ score: 1800, streak: 3, correctCount: 3, rank: 1 }) },
      }),
    );
    expect(res.scores.a).toEqual({
      score: 1800,
      streak: 0,
      rank: 1,
      lastDelta: 0,
      lastCorrect: false,
      lastAnswered: true,
      correctCount: 3,
    });
  });

  it("no answer resets the streak and answered is false", () => {
    const res = scoreQuestion(
      input({ players: { a: player("A") }, prevScores: { a: score({ score: 500, streak: 2, correctCount: 2 }) } }),
    );
    expect(res.scores.a.streak).toBe(0);
    expect(res.scores.a.lastAnswered).toBe(false);
    expect(res.scores.a.lastCorrect).toBe(false);
    expect(res.scores.a.score).toBe(500);
    expect(res.scores.a.correctCount).toBe(2);
  });

  it("adds streak bonus based on previous streak", () => {
    const res = scoreQuestion(
      input({
        players: { a: player("A") },
        answers: { a: ans(0, 0) },
        correct: 0,
        prevScores: { a: score({ score: 2000, streak: 2, correctCount: 2 }) },
      }),
    );
    // streak becomes 3 → bonus 200
    expect(res.scores.a.streak).toBe(3);
    expect(res.scores.a.lastDelta).toBe(1200);
    expect(res.scores.a.score).toBe(3200);
    expect(res.scores.a.correctCount).toBe(3);
  });

  it("caps streak bonus at max", () => {
    const res = scoreQuestion(
      input({
        players: { a: player("A") },
        answers: { a: ans(0, 0) },
        prevScores: { a: score({ score: 0, streak: 20 }) },
      }),
    );
    expect(res.scores.a.streak).toBe(21);
    expect(res.scores.a.lastDelta).toBe(1500);
  });

  it("no streak bonus when disabled, but streak still counts", () => {
    const res = scoreQuestion(
      input({
        players: { a: player("A") },
        answers: { a: ans(0, 0) },
        prevScores: { a: score({ streak: 4 }) },
        rules: NO_STREAK,
      }),
    );
    expect(res.scores.a.streak).toBe(5);
    expect(res.scores.a.lastDelta).toBe(1000);
  });

  it("uses rules.maxPoints", () => {
    const res = scoreQuestion(
      input({
        players: { a: player("A") },
        answers: { a: ans(0, 0) },
        rules: { ...RULES, maxPoints: 2000 },
      }),
    );
    expect(res.scores.a.lastDelta).toBe(2000);
  });

  it("late correct answer counts as not correct and resets streak", () => {
    const res = scoreQuestion(
      input({
        players: { a: player("A") },
        answers: { a: ans(0, DUR + 1) },
        correct: 0,
        prevScores: { a: score({ score: 900, streak: 3, correctCount: 3 }) },
      }),
    );
    expect(res.scores.a.lastCorrect).toBe(false);
    expect(res.scores.a.lastDelta).toBe(0);
    expect(res.scores.a.streak).toBe(0);
    expect(res.scores.a.score).toBe(900);
    expect(res.scores.a.correctCount).toBe(3);
    expect(res.scores.a.lastAnswered).toBe(true);
  });

  it("answer exactly at the deadline is still correct (500 points)", () => {
    const res = scoreQuestion(input({ players: { a: player("A") }, answers: { a: ans(0, DUR) } }));
    expect(res.scores.a.lastCorrect).toBe(true);
    expect(res.scores.a.lastDelta).toBe(500);
  });

  it("answer timestamped before startedAt gets full points", () => {
    const res = scoreQuestion(input({ players: { a: player("A") }, answers: { a: ans(0, -300) } }));
    expect(res.scores.a.lastDelta).toBe(1000);
  });

  it("ignores answers from uids not in players", () => {
    const res = scoreQuestion(
      input({ players: { a: player("A") }, answers: { a: ans(1, 0), ghost: ans(0, 0) }, correct: 0 }),
    );
    expect(Object.keys(res.scores)).toEqual(["a"]);
    expect(res.counts).toEqual([0, 1, 0, 0]);
    expect(res.leaderboard.playerCount).toBe(1);
  });

  it("drops prevScores of uids not in players", () => {
    const res = scoreQuestion(
      input({ players: { a: player("A") }, prevScores: { gone: score({ score: 5000 }) } }),
    );
    expect(Object.keys(res.scores)).toEqual(["a"]);
    expect(res.leaderboard.top).toEqual([{ name: "A", score: 0, rank: 1 }]);
  });

  it.each([
    ["out of range high", { choice: 4, at: T0 }],
    ["negative", { choice: -1, at: T0 }],
    ["non-integer", { choice: 1.5, at: T0 }],
    ["NaN", { choice: NaN, at: T0 }],
    ["string choice", { choice: "0", at: T0 }],
    ["missing at", { choice: 0 }],
    ["string at", { choice: 0, at: "now" }],
    ["null entry", null],
  ])("ignores invalid answer (%s)", (_label, entry) => {
    const res = scoreQuestion(
      input({
        players: { a: player("A") },
        answers: { a: entry as unknown as AnswerEntry },
        correct: 0,
        prevScores: { a: score({ streak: 2, score: 100 }) },
      }),
    );
    expect(res.scores.a.lastAnswered).toBe(false);
    expect(res.scores.a.lastCorrect).toBe(false);
    expect(res.scores.a.streak).toBe(0);
    expect(res.scores.a.score).toBe(100);
    expect(res.counts).toEqual([0, 0, 0, 0]);
  });

  it("choice out of range for a 2-option question is ignored", () => {
    const res = scoreQuestion(
      input({ players: { a: player("A") }, answers: { a: ans(2, 0) }, optionCount: 2, correct: 0 }),
    );
    expect(res.counts).toEqual([0, 0]);
    expect(res.scores.a.lastAnswered).toBe(false);
  });

  it("counts has length optionCount and tallies valid answers (incl. late ones)", () => {
    const res = scoreQuestion(
      input({
        players: { a: player("A"), b: player("B"), c: player("C"), d: player("D"), e: player("E") },
        answers: { a: ans(0, 0), b: ans(0, 100), c: ans(2, 200), d: ans(1, DUR + 5) },
        optionCount: 3,
        correct: 0,
      }),
    );
    expect(res.counts).toEqual([2, 1, 1]);
  });

  it("ranks after applying the question and builds a top-N leaderboard", () => {
    const players = {
      u1: player("Ayşe"),
      u2: player("Bora"),
      u3: player("Cem"),
      u4: player("Deniz"),
    };
    const res = scoreQuestion(
      input({
        players,
        answers: { u1: ans(0, 0), u2: ans(0, DUR), u3: ans(1, 0) },
        correct: 0,
        prevScores: {
          u1: score({ score: 0 }),
          u2: score({ score: 600 }),
          u3: score({ score: 1500 }),
          u4: score({ score: 1000 }),
        },
        leaderboardSize: 3,
      }),
    );
    // u1 1000, u2 1100, u3 1500, u4 1000
    expect(res.scores.u3.rank).toBe(1);
    expect(res.scores.u2.rank).toBe(2);
    expect(res.scores.u1.rank).toBe(3);
    expect(res.scores.u4.rank).toBe(3);
    expect(res.leaderboard).toEqual({
      top: [
        { name: "Cem", score: 1500, rank: 1 },
        { name: "Bora", score: 1100, rank: 2 },
        { name: "Ayşe", score: 1000, rank: 3 },
      ],
      playerCount: 4,
    });
  });

  it("leaderboard shorter than size when few players; empty game works", () => {
    const res = scoreQuestion(input({ players: { a: player("A") } }));
    expect(res.leaderboard.top).toHaveLength(1);
    const empty = scoreQuestion(input({}));
    expect(empty.scores).toEqual({});
    expect(empty.leaderboard).toEqual({ top: [], playerCount: 0 });
    expect(empty.counts).toEqual([0, 0, 0, 0]);
  });

  it("leaderboard tie order is deterministic by name then uid", () => {
    const res = scoreQuestion(
      input({
        players: { b2: player("Ali"), b1: player("Ali"), c: player("Zeki"), a: player("Mert") },
        answers: { b2: ans(0, 0), b1: ans(0, 0), c: ans(0, 0), a: ans(0, 0) },
        leaderboardSize: 4,
      }),
    );
    expect(res.leaderboard.top.map((e) => e.name)).toEqual(["Ali", "Ali", "Mert", "Zeki"]);
    expect(res.leaderboard.top.every((e) => e.rank === 1)).toBe(true);
    expect(Object.keys(res.scores)).toEqual(["b1", "b2", "a", "c"]);
  });

  it("does not mutate inputs", () => {
    const prev = { a: score({ score: 10, streak: 1 }) };
    const snapshot = JSON.parse(JSON.stringify(prev));
    scoreQuestion(input({ players: { a: player("A") }, answers: { a: ans(0, 0) }, prevScores: prev }));
    expect(prev).toEqual(snapshot);
  });

  it("simulates a 3-question game", () => {
    const players = { a: player("A"), b: player("B") };
    let prev: Record<string, PlayerScore> = {};
    // Q1: both correct, a instantly, b at end
    let r = scoreQuestion(input({ players, answers: { a: ans(0, 0), b: ans(0, DUR) }, prevScores: prev }));
    expect(r.scores.a.score).toBe(1000);
    expect(r.scores.b.score).toBe(500);
    prev = r.scores;
    // Q2: a correct (streak 2 → +100), b wrong
    r = scoreQuestion(input({ players, answers: { a: ans(1, 0), b: ans(0, 0) }, correct: 1, prevScores: prev }));
    expect(r.scores.a.score).toBe(2100);
    expect(r.scores.b.score).toBe(500);
    prev = r.scores;
    // Q3: b correct (streak 1), a no answer
    r = scoreQuestion(input({ players, answers: { b: ans(3, 0) }, correct: 3, prevScores: prev }));
    expect(r.scores.a).toMatchObject({ score: 2100, streak: 0, correctCount: 2, rank: 1, lastAnswered: false });
    expect(r.scores.b).toMatchObject({ score: 1500, streak: 1, correctCount: 2, rank: 2, lastDelta: 1000 });
  });
});
