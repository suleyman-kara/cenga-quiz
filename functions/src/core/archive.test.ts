import { describe, it, expect } from "vitest";
import { buildGameResult, hasScores, resultIdFor } from "./archive";
import { lobbyRoom } from "./fixtures";
import type { Room } from "./room";

const s = (score: number, correctCount: number) => ({
  score,
  streak: 0,
  rank: 0,
  lastDelta: 0,
  lastCorrect: false,
  lastAnswered: false,
  correctCount,
});

describe("buildGameResult", () => {
  it("builds a GameResultDoc with results sorted by rank (ties share rank)", () => {
    const room: Room = {
      ...lobbyRoom({ p1: "Ali", p2: "Ayşe", p3: "Can", p4: "Deniz" }),
      scores: { p1: s(500, 1), p2: s(1500, 2), p3: s(500, 1) },
    };
    const doc = buildGameResult(room, { pin: "123456", now: 9999, retentionDays: 2 });
    expect(doc).toEqual({
      pin: "123456",
      hostUid: "host",
      quizId: "q1",
      title: "Deneme",
      createdAt: 1000,
      endedAt: 9999,
      playerCount: 4,
      questionCount: 2,
      expireAt: new Date(9999 + 2 * 86_400_000),
      results: [
        { uid: "p2", name: "Ayşe", score: 1500, rank: 1, correctCount: 2 },
        { uid: "p1", name: "Ali", score: 500, rank: 2, correctCount: 1 },
        { uid: "p3", name: "Can", score: 500, rank: 2, correctCount: 1 },
        { uid: "p4", name: "Deniz", score: 0, rank: 4, correctCount: 0 },
      ],
    });
  });

  it("never carries a stored prevRank / streak into the archived results", () => {
    const room: Room = {
      ...lobbyRoom({ p1: "Ali" }),
      scores: { p1: { ...s(500, 1), streak: 2, rank: 1, prevRank: 3 } },
    };
    expect(buildGameResult(room, { pin: "1", now: 1, retentionDays: 1 }).results).toEqual([
      { uid: "p1", name: "Ali", score: 500, rank: 1, correctCount: 1 },
    ]);
  });

  it("handles a room without players", () => {
    const doc = buildGameResult(lobbyRoom({}), { pin: "123456", now: 1, retentionDays: 365 });
    expect(doc.results).toEqual([]);
    expect(doc.playerCount).toBe(0);
  });

  it("leaves out banned uids and partial player entries (kick races)", () => {
    const room = {
      ...lobbyRoom({ p1: "Ali" }),
      scores: { p1: s(100, 1), p2: s(900, 3) },
      banned: { p2: true },
    } as Room;
    room.players!.p2 = { name: "Hayalet", joinedAt: 1 };
    (room.players as Record<string, unknown>).p3 = { name: "Yarım" };
    const doc = buildGameResult(room, { pin: "123456", now: 1, retentionDays: 1 });
    expect(doc.playerCount).toBe(1);
    expect(doc.results.map((r) => r.uid)).toEqual(["p1"]);
  });
});

describe("hasScores", () => {
  it("is true only when some score node exists", () => {
    expect(hasScores(lobbyRoom())).toBe(false);
    expect(hasScores({ ...lobbyRoom(), scores: { p1: s(0, 0) } })).toBe(true);
  });
});

describe("resultIdFor", () => {
  it("is deterministic per room: pin + meta.createdAt", () => {
    expect(resultIdFor("123456", lobbyRoom())).toBe("123456_1000");
    expect(resultIdFor("123456", {})).toBe("123456_0");
  });
});
