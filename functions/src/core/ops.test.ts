import { describe, it, expect } from "vitest";
import { planStart, planReveal, planShowLeaderboard, planNext, planEnd } from "./ops";
import { applyPatch, type Room } from "./room";
import { GameError } from "./errors";
import { config, lobbyRoom, quiz } from "./fixtures";

function errCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof GameError ? e.code : `other:${String(e)}`;
  }
  return undefined;
}

const host = { uid: "host", config, quiz };

function started(now = 10_000): Room {
  const r = lobbyRoom();
  return applyPatch(r, planStart(r, { ...host, now })) as Room;
}

describe("common guards", () => {
  it("not-found when the room does not exist", () => {
    expect(errCode(() => planStart(null, { ...host, now: 1 }))).toBe("not-found");
    expect(errCode(() => planEnd({}, { ...host, now: 1 }))).toBe("not-found");
  });
  it("permission-denied for a caller who is not this game's host", () => {
    expect(errCode(() => planStart(lobbyRoom(), { ...host, uid: "other", now: 1 }))).toBe("permission-denied");
    expect(errCode(() => planEnd(lobbyRoom(), { ...host, uid: "other", now: 1 }))).toBe("permission-denied");
  });
});

describe("planStart", () => {
  it("moves lobby → question 0", () => {
    const r = started(10_000);
    expect(r.state).toEqual({ phase: "question", qIndex: 0, startedAt: 10_000, endsAt: 20_000, updatedAt: 10_000 });
    expect(r.question?.index).toBe(0);
  });
  it("requires at least one player", () => {
    expect(errCode(() => planStart(lobbyRoom({}), { ...host, now: 1 }))).toBe("failed-precondition");
  });
  it("refuses more than maxPlayers", () => {
    const r = lobbyRoom({ a: "A", b: "B", c: "C", d: "D" });
    expect(errCode(() => planStart(r, { ...host, now: 1 }))).toBe("failed-precondition");
  });
  it("refuses when not in lobby", () => {
    expect(errCode(() => planStart(started(), { ...host, now: 1 }))).toBe("failed-precondition");
  });
});

describe("planReveal", () => {
  it("refuses early reveal when not everyone answered", () => {
    const r = applyPatch(started(10_000), { "answers/0/p1": { choice: 2, at: 11_000 } });
    expect(errCode(() => planReveal(r, { ...host, now: 12_000 }))).toBe("failed-precondition");
  });

  it("scores and moves to reveal once everyone answered", () => {
    const r = applyPatch(started(10_000), {
      "answers/0/p1": { choice: 2, at: 11_000 },
      "answers/0/p2": { choice: 1, at: 10_500 },
    }) as Room;
    const patch = planReveal(r, { ...host, now: 12_000 });
    const out = applyPatch(r, patch) as Room;
    expect(out.state).toEqual({ phase: "reveal", qIndex: 0, startedAt: 0, endsAt: 0, updatedAt: 12_000 });
    expect(out.reveal).toEqual({ qIndex: 0, correct: 2, counts: [0, 1, 1, 0] });
    expect(out.scores?.p1.score).toBe(950);
    expect(out.scores?.p1.rank).toBe(1);
    expect(out.scores?.p2).toMatchObject({ score: 0, lastAnswered: true, lastCorrect: false, rank: 2 });
    expect(out.leaderboard).toEqual({
      top: [
        { name: "Ali", score: 950, rank: 1 },
        { name: "Ayşe", score: 0, rank: 2 },
      ],
      playerCount: 2,
    });
    // question node is kept for display
    expect(out.question?.index).toBe(0);
  });

  it("allows reveal after time is up and builds on previous scores", () => {
    const r = applyPatch(started(10_000), {
      "answers/0/p1": { choice: 2, at: 10_000 },
      scores: { p1: { score: 500, streak: 1, rank: 1, lastDelta: 500, lastCorrect: true, lastAnswered: true, correctCount: 1 } },
    }) as Room;
    const out = applyPatch(r, planReveal(r, { ...host, now: 20_000 })) as Room;
    expect(out.scores?.p1).toMatchObject({ score: 500 + 1000 + 100, streak: 2, correctCount: 2 });
    expect(out.scores?.p2).toMatchObject({ score: 0, lastAnswered: false });
  });

  it("a second reveal on the revealed room is refused (no double scoring)", () => {
    const r = applyPatch(started(10_000), { "answers/0/p1": { choice: 2, at: 11_000 } }) as Room;
    const once = applyPatch(r, planReveal(r, { ...host, now: 20_000 })) as Room;
    expect(errCode(() => planReveal(once, { ...host, now: 20_001 }))).toBe("failed-precondition");
  });

  it("refuses outside the question phase", () => {
    expect(errCode(() => planReveal(lobbyRoom(), { ...host, now: 1 }))).toBe("failed-precondition");
  });
});

function revealed(): Room {
  const r = applyPatch(started(10_000), { "answers/0/p1": { choice: 2, at: 11_000 } }) as Room;
  return applyPatch(r, planReveal(r, { ...host, now: 20_000 })) as Room;
}

describe("planShowLeaderboard", () => {
  it("reveal → leaderboard", () => {
    const out = applyPatch(revealed(), planShowLeaderboard(revealed(), { ...host, now: 21_000 })) as Room;
    expect(out.state).toMatchObject({ phase: "leaderboard", qIndex: 0, updatedAt: 21_000 });
  });
  it("refused from question", () => {
    expect(errCode(() => planShowLeaderboard(started(), { ...host, now: 1 }))).toBe("failed-precondition");
  });
});

describe("planNext", () => {
  it("reveal → next question, clearing reveal", () => {
    const r = revealed();
    const out = applyPatch(r, planNext(r, { ...host, now: 30_000 })) as Room;
    expect(out.state).toEqual({ phase: "question", qIndex: 1, startedAt: 30_000, endsAt: 50_000, updatedAt: 30_000 });
    expect(out.reveal).toBeUndefined();
    expect(out.question).toMatchObject({ index: 1, text: "S2" });
    expect(JSON.stringify(out.question)).not.toContain("correct");
  });
  it("leaderboard → next question", () => {
    const r = applyPatch(revealed(), { "state/phase": "leaderboard" });
    expect(applyPatch(r, planNext(r, { ...host, now: 30_000 })).state.qIndex).toBe(1);
  });
  it("refused past the last question", () => {
    const r = applyPatch(revealed(), { "state/qIndex": 1 });
    expect(errCode(() => planNext(r, { ...host, now: 1 }))).toBe("failed-precondition");
  });
  it("refused from question", () => {
    expect(errCode(() => planNext(started(), { ...host, now: 1 }))).toBe("failed-precondition");
  });
});

describe("planEnd", () => {
  it("ends from any active phase, keeping the leaderboard", () => {
    const r = revealed();
    const out = applyPatch(r, planEnd(r, { ...host, now: 40_000 })) as Room;
    expect(out.state).toEqual({ phase: "ended", qIndex: 0, startedAt: 0, endsAt: 0, updatedAt: 40_000 });
    expect(out.leaderboard).toEqual(r.leaderboard);
  });
  it("writes a final leaderboard if none exists yet", () => {
    const out = applyPatch(lobbyRoom(), planEnd(lobbyRoom(), { ...host, now: 2 })) as Room;
    expect(out.leaderboard).toEqual({
      top: [
        { name: "Ali", score: 0, rank: 1 },
        { name: "Ayşe", score: 0, rank: 1 },
      ],
      playerCount: 2,
    });
  });
  it("refused when already ended", () => {
    const r = applyPatch(lobbyRoom(), { "state/phase": "ended" });
    expect(errCode(() => planEnd(r, { ...host, now: 1 }))).toBe("failed-precondition");
  });
});
