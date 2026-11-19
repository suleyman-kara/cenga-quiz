import { describe, it, expect } from "vitest";
import {
  planStart,
  planReveal,
  planShowLeaderboard,
  planNext,
  planEnd,
  planKick,
  planKickMany,
  planSetLobbyLocked,
} from "./ops";
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
  it("sanitizes names in the same update: blocked → generated, duplicates suffixed", () => {
    const r = lobbyRoom({ p1: "Ali", p2: "ali", p3: "orospu" });
    r.players!.p2.joinedAt = 1600;
    const patch = planStart(r, { ...host, now: 1 });
    expect(patch["players/p2"]).toEqual({ name: "ali (2)", joinedAt: 1600 });
    expect(patch["players/p3"]).toEqual({ name: "Oyuncu 1", joinedAt: 1500 });
    expect(patch["players/p1"]).toBeUndefined();
  });
  it("does not rename players removed for capacity", () => {
    const r = lobbyRoom({ a: "A", b: "B", c: "C", d: "orospu" });
    r.players!.d.joinedAt = 9999;
    const patch = planStart(r, { ...host, now: 1 });
    expect(patch["players/d"]).toBeNull();
  });
  it("applies the configured lead-in to start and next", () => {
    const lead = { ...host, config: { ...config, leadInMs: 3000 } };
    const r = lobbyRoom();
    const out = applyPatch(r, planStart(r, { ...lead, now: 10_000 })) as Room;
    expect(out.state).toMatchObject({ startedAt: 13_000, endsAt: 23_000, updatedAt: 10_000 });
    const rev = applyPatch(out, { "state/phase": "reveal" }) as Room;
    expect(planNext(rev, { ...lead, now: 50_000 }).state).toMatchObject({ startedAt: 53_000, endsAt: 73_000 });
  });
  it("requires at least one player", () => {
    expect(errCode(() => planStart(lobbyRoom({}), { ...host, now: 1 }))).toBe("failed-precondition");
  });
  it("keeps the earliest maxPlayers by joinedAt and removes the rest instead of failing", () => {
    const r = lobbyRoom({ a: "A", b: "B", c: "C", d: "D", e: "E" });
    const joined: Record<string, number> = { a: 50, b: 10, c: 40, d: 20, e: 30 };
    for (const uid of Object.keys(joined)) r.players![uid].joinedAt = joined[uid];
    const patch = planStart(r, { ...host, now: 1 }); // config.maxPlayers = 3
    expect(patch["players/a"]).toBeNull();
    expect(patch["players/c"]).toBeNull();
    const out = applyPatch(r, patch) as Room;
    expect(Object.keys(out.players!).sort()).toEqual(["b", "d", "e"]);
    expect(out.state?.phase).toBe("question");
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
    expect(out.scores?.p1).toMatchObject({ score: 500 + 1000 + 40, streak: 2, correctCount: 2 });
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
    expect(applyPatch(r, planNext(r, { ...host, now: 30_000 })).state?.qIndex).toBe(1);
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

describe("planKick", () => {
  it("removes the player and their score, bans them", () => {
    const r = applyPatch(revealed(), {}) as Room;
    const patch = planKick(r, { ...host, now: 1 }, "p2");
    expect(patch).toMatchObject({ "players/p2": null, "scores/p2": null, "banned/p2": true });
    const out = applyPatch(r, patch) as Room;
    expect(out.players?.p2).toBeUndefined();
    expect(out.banned).toEqual({ p2: true });
  });
  it("rewrites an existing leaderboard without the kicked player", () => {
    const r = revealed(); // p1 950, p2 0
    const out = applyPatch(r, planKick(r, { ...host, now: 1 }, "p1")) as Room;
    expect(out.leaderboard).toEqual({ top: [{ name: "Ayşe", score: 0, rank: 1 }], playerCount: 1 });
    expect(out.scores?.p2.rank).toBe(1);
  });
  it("works in the lobby (no leaderboard written) and for unknown uids", () => {
    const patch = planKick(lobbyRoom(), { ...host, now: 1 }, "ghost");
    expect(patch).toEqual({ "players/ghost": null, "scores/ghost": null, "banned/ghost": true, "meta/lastActivityAt": 1 });
  });
  it("host only, not after the game ended", () => {
    expect(errCode(() => planKick(lobbyRoom(), { ...host, uid: "x", now: 1 }, "p1"))).toBe("permission-denied");
    const ended = applyPatch(lobbyRoom(), { "state/phase": "ended" });
    expect(errCode(() => planKick(ended, { ...host, now: 1 }, "p1"))).toBe("failed-precondition");
  });
});

describe("planSetLobbyLocked", () => {
  it("sets meta.locked", () => {
    expect(planSetLobbyLocked(lobbyRoom(), { ...host, now: 1 }, true)).toMatchObject({ "meta/locked": true });
    expect(planSetLobbyLocked(lobbyRoom(), { ...host, now: 1 }, false)).toMatchObject({ "meta/locked": false });
  });
  it("counts as lobby activity (meta.lastActivityAt)", () => {
    expect(planSetLobbyLocked(lobbyRoom(), { ...host, now: 77 }, true)["meta/lastActivityAt"]).toBe(77);
  });
  it("host only, not after the game ended", () => {
    expect(errCode(() => planSetLobbyLocked(lobbyRoom(), { ...host, uid: "x", now: 1 }, true))).toBe("permission-denied");
    const ended = applyPatch(lobbyRoom(), { "state/phase": "ended" });
    expect(errCode(() => planSetLobbyLocked(ended, { ...host, now: 1 }, true))).toBe("failed-precondition");
  });
});

describe("banned uids and partial player entries (kick races)", () => {
  /** p3 was kicked (banned) but a racing write left a partial players/p3 = { name } behind. */
  function withGhost(r: Room): Room {
    return applyPatch(r, { "players/p3": { name: "Hayalet" }, "banned/p3": true, "players/p4": { name: "Yarım" } }) as Room;
  }

  it("planStart writes full player objects, never bare name paths, and drops banned/partial entries", () => {
    const r = withGhost(lobbyRoom({ p1: "Ali", p2: "ali" }));
    const patch = planStart(r, { ...host, now: 1 });
    for (const key of Object.keys(patch)) expect(key).not.toMatch(/^players\/[^/]+\/name$/);
    expect(patch["players/p2"]).toEqual({ name: "ali (2)", joinedAt: 1500 });
    expect(patch["players/p3"]).toBeNull();
    expect(patch["players/p4"]).toBeNull();
    const out = applyPatch(r, patch) as Room;
    expect(Object.keys(out.players!).sort()).toEqual(["p1", "p2"]);
  });

  it("planStart does not count banned/partial entries as players", () => {
    const r = withGhost(lobbyRoom({}));
    expect(errCode(() => planStart(r, { ...host, now: 1 }))).toBe("failed-precondition");
  });

  it("planReveal never scores a banned uid or a partial entry and drops them", () => {
    let r = started(10_000);
    r = withGhost(
      applyPatch(r, {
        "answers/0/p1": { choice: 2, at: 11_000 },
        "answers/0/p2": { choice: 2, at: 11_000 },
        "answers/0/p3": { choice: 2, at: 10_100 },
        "scores/p3": { score: 5000, streak: 1, rank: 1, lastDelta: 0, lastCorrect: true, lastAnswered: true, correctCount: 1 },
      }) as Room,
    );
    // everyone *active* answered → early reveal allowed even though p4 (partial) did not
    const patch = planReveal(r, { ...host, now: 12_000 });
    const out = applyPatch(r, patch) as Room;
    expect(Object.keys(out.scores!).sort()).toEqual(["p1", "p2"]);
    expect(out.leaderboard?.playerCount).toBe(2);
    expect(out.leaderboard?.top.map((e) => e.name)).not.toContain("Hayalet");
    expect(out.reveal?.counts).toEqual([0, 0, 2, 0]);
    expect(patch["players/p3"]).toBeNull();
    expect(patch["players/p4"]).toBeNull();
  });

  it("planEnd's leaderboard ignores banned and partial entries", () => {
    const r = withGhost(lobbyRoom());
    const out = applyPatch(r, planEnd(r, { ...host, now: 2 })) as Room;
    expect(out.leaderboard?.playerCount).toBe(2);
    expect(out.leaderboard?.top.map((e) => e.name).sort()).toEqual(["Ali", "Ayşe"]);
  });
});

describe("planKickMany", () => {
  it("removes, unscores and bans every target in one patch", () => {
    const r = applyPatch(revealed(), { "players/p5": { name: "Can", joinedAt: 1600 } }) as Room;
    const patch = planKickMany(r, { ...host, now: 1 }, ["p1", "p5"]);
    expect(patch).toMatchObject({
      "players/p1": null,
      "scores/p1": null,
      "banned/p1": true,
      "players/p5": null,
      "scores/p5": null,
      "banned/p5": true,
    });
    const out = applyPatch(r, patch) as Room;
    expect(Object.keys(out.players!)).toEqual(["p2"]);
    expect(out.leaderboard).toEqual({ top: [{ name: "Ayşe", score: 0, rank: 1 }], playerCount: 1 });
    expect(out.scores?.p2.rank).toBe(1);
  });
  it("leaderboard rebuild ignores previously banned uids still present in scores", () => {
    const r = applyPatch(revealed(), { "banned/p1": true }) as Room;
    const out = applyPatch(r, planKickMany(r, { ...host, now: 1 }, ["p2"])) as Room;
    expect(out.leaderboard).toEqual({ top: [], playerCount: 0 });
  });
  it("planKick is planKickMany with one uid", () => {
    expect(planKick(lobbyRoom(), { ...host, now: 1 }, "p1")).toEqual(planKickMany(lobbyRoom(), { ...host, now: 1 }, ["p1"]));
  });
  it("host only, not after the game ended", () => {
    expect(errCode(() => planKickMany(lobbyRoom(), { ...host, uid: "x", now: 1 }, ["p1"]))).toBe("permission-denied");
  });
});
