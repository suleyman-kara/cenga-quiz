import { describe, it, expect, beforeEach } from "vitest";
import { adminDb, adminFs, resetEmulators } from "./helpers";
import { runCleanup } from "../../functions/src/game/cleanup";
import { club } from "../../src/club.config";

const MIN = 60_000;
const HOUR = 60 * MIN;

function room(phase: string, updatedAt: number, withScores = false, archived = phase === "ended") {
  return {
    meta: { hostUid: "h1", quizId: "q1", title: "Eski oyun", createdAt: updatedAt - HOUR, questionCount: 2, archived },
    state: { phase, qIndex: phase === "lobby" ? -1 : 0, startedAt: 0, endsAt: 0, updatedAt },
    players: { pa: { name: "Ali", joinedAt: updatedAt - HOUR } },
    ...(withScores
      ? {
          scores: {
            pa: { score: 700, streak: 1, rank: 1, lastDelta: 700, lastCorrect: true, lastAnswered: true, correctCount: 1 },
          },
        }
      : {}),
  };
}

describe("runCleanup", () => {
  beforeEach(resetEmulators);

  it("removes old ended rooms and abandoned rooms (archiving those with scores), keeps the rest", async () => {
    const now = Date.now();
    const abandoned = now - (club.game.abandonedAfterHours * HOUR + MIN);
    await adminDb()
      .ref("games")
      .set({
        "111111": room("ended", now - 31 * MIN),
        "222222": room("ended", now - 5 * MIN),
        "333333": room("question", now - 10 * MIN),
        "444444": room("reveal", abandoned, true),
        "555555": room("lobby", abandoned),
      });
    for (const pin of ["333333", "444444", "555555"]) {
      await adminFs().doc(`liveGames/${pin}`).set({ pin, hostUid: "h1", quizId: "q1", quiz: { title: "x", questions: [] }, createdAt: now - 7 * HOUR });
    }
    // orphan private snapshot without a room
    await adminFs().doc("liveGames/666666").set({ pin: "666666", hostUid: "h1", quizId: "q1", quiz: { title: "x", questions: [] }, createdAt: abandoned });

    const summary = await runCleanup(now);

    const games = (await adminDb().ref("games").get()).val() ?? {};
    expect(Object.keys(games).sort()).toEqual(["222222", "333333"]);
    expect((await adminFs().doc("liveGames/333333").get()).exists).toBe(true);
    for (const pin of ["444444", "555555", "666666"]) {
      expect((await adminFs().doc(`liveGames/${pin}`).get()).exists).toBe(false);
    }
    const results = await adminFs().collection("gameResults").get();
    expect(results.docs.map((d) => d.data().pin)).toEqual(["444444"]);
    expect(results.docs[0].id).toBe(`444444_${abandoned - HOUR}`);
    expect(results.docs[0].data().results[0]).toMatchObject({ uid: "pa", score: 700, rank: 1 });
    expect(summary).toMatchObject({ removed: 3, archived: 1 });
  });

  it("archives an ended-but-unarchived room exactly once (deterministic id, set())", async () => {
    const now = Date.now();
    const r = room("ended", now - 31 * MIN, true, false);
    await adminDb().ref("games/777777").set(r);
    // a previous, partially failed attempt already wrote the result
    await adminFs().doc(`gameResults/777777_${r.meta.createdAt}`).set({ pin: "777777", stale: true });
    const summary = await runCleanup(now);
    expect(summary).toMatchObject({ removed: 1, archived: 1 });
    const results = await adminFs().collection("gameResults").get();
    expect(results.docs.map((d) => d.id)).toEqual([`777777_${r.meta.createdAt}`]);
    const doc = results.docs[0].data();
    expect(doc.stale).toBeUndefined();
    expect(doc.results[0]).toMatchObject({ uid: "pa", score: 700 });
    expect(doc.expireAt.toMillis()).toBe(doc.endedAt + club.game.resultsRetentionDays * 24 * HOUR);
  });

  it("is a no-op on an empty database", async () => {
    await expect(runCleanup(Date.now())).resolves.toMatchObject({ removed: 0, archived: 0 });
  });
});
