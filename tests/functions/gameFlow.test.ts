import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  adminAnswer,
  adminDb,
  adminFs,
  adminJoin,
  allowHost,
  disposeClients,
  expectCode,
  readRoom,
  resetEmulators,
  saveQuiz,
  signInAnon,
  signInGoogle,
  type Client,
} from "./helpers";
import { club } from "../../src/club.config";
import type { GameMeta, GameResultDoc, GameState, Leaderboard, PlayerScore, PublicQuestion, RevealData } from "../../shared/types";

let host: Client;
let pin: string;

async function newGame(players: Record<string, string> = { pa: "Ali", pb: "Banu", pc: "Cem" }) {
  await allowHost("host@example.com");
  host = await signInGoogle("host1", "host@example.com");
  await saveQuiz("q1", host.uid);
  ({ pin } = await host.call("createGame", { quizId: "q1" }));
  for (const [uid, name] of Object.entries(players)) await adminJoin(pin, uid, name);
}

const state = () => readRoom<GameState>(pin, "state");
const scores = () => readRoom<Record<string, PlayerScore>>(pin, "scores");

describe("game flow (host callables)", () => {
  beforeEach(resetEmulators);
  afterAll(disposeClients);

  it("startGame requires at least one player", async () => {
    await newGame({});
    expect(await expectCode(host.call("startGame", { pin }))).toBe("functions/failed-precondition");
  });

  it("only this game's host may drive it", async () => {
    await newGame();
    await allowHost("other@example.com");
    const other = await signInGoogle("host2", "other@example.com");
    expect(await expectCode(other.call("startGame", { pin }))).toBe("functions/permission-denied");
    const player = await signInAnon();
    expect(await expectCode(player.call("startGame", { pin }))).toBe("functions/permission-denied");
    expect(await expectCode(host.call("startGame", { pin: "999999" }))).toBe("functions/not-found");
    expect(await expectCode(host.call("startGame", { pin: "abc" }))).toBe("functions/invalid-argument");
  });

  it("startGame shows question 0 with server timing and without the correct index", async () => {
    await newGame();
    const before = Date.now();
    await host.call("startGame", { pin });
    const s = await state();
    expect(s.phase).toBe("question");
    expect(s.qIndex).toBe(0);
    expect(s.endsAt - s.startedAt).toBe(5000);
    expect(Math.abs(s.startedAt - before)).toBeLessThan(10_000);
    const q = await readRoom<PublicQuestion>(pin, "question");
    expect(q).toEqual({ index: 0, text: "Birinci soru", options: ["A", "B", "C", "D"], seconds: 5 });
    expect(JSON.stringify(q)).not.toMatch(/correct/);
    expect(await expectCode(host.call("startGame", { pin }))).toBe("functions/failed-precondition");
  });

  it("refuses early reveal until everyone answered, then scores faster correct > slower correct > wrong", async () => {
    await newGame();
    await host.call("startGame", { pin });
    await adminAnswer(pin, 0, "pa", 1, 500);
    expect(await expectCode(host.call("reveal", { pin, qIndex: 0 }))).toBe("functions/failed-precondition");
    await adminAnswer(pin, 0, "pb", 1, 2500);
    expect(await expectCode(host.call("reveal", { pin, qIndex: 0 }))).toBe("functions/failed-precondition");
    await adminAnswer(pin, 0, "pc", 3, 100);
    await host.call("reveal", { pin, qIndex: 0 });

    expect((await state()).phase).toBe("reveal");
    expect(await readRoom<RevealData>(pin, "reveal")).toEqual({ qIndex: 0, correct: 1, counts: [0, 2, 0, 1] });
    const sc = await scores();
    expect(sc.pa.score).toBeGreaterThan(sc.pb.score);
    expect(sc.pb.score).toBeGreaterThan(sc.pc.score);
    expect(sc.pc).toMatchObject({ score: 0, lastAnswered: true, lastCorrect: false });
    expect([sc.pa.rank, sc.pb.rank, sc.pc.rank]).toEqual([1, 2, 3]);
    const lb = await readRoom<Leaderboard>(pin, "leaderboard");
    expect(lb.playerCount).toBe(3);
    expect(lb.top.map((e) => e.name)).toEqual(["Ali", "Banu", "Cem"]);
  });

  it("reveal is allowed once the time is up even if not everyone answered", async () => {
    await newGame();
    await host.call("startGame", { pin });
    // move the question window into the past: started 6s ago, ended 1s ago
    const now = Date.now();
    await adminDb().ref(`games/${pin}/state`).update({ startedAt: now - 6000, endsAt: now - 1000 });
    await adminAnswer(pin, 0, "pa", 1, 1000);
    await host.call("reveal", { pin, qIndex: 0 });
    const sc = await scores();
    expect(sc.pa.lastCorrect).toBe(true);
    expect(sc.pb).toMatchObject({ score: 0, lastAnswered: false });
  });

  it("concurrent double reveal scores only once", async () => {
    await newGame({ pa: "Ali" });
    await host.call("startGame", { pin });
    await adminAnswer(pin, 0, "pa", 1, 0);
    const results = await Promise.allSettled([
      host.call("reveal", { pin, qIndex: 0 }),
      host.call("reveal", { pin, qIndex: 0 }),
      host.call("reveal", { pin, qIndex: 0 }),
    ]);
    // exactly one call did the work; the others were refused as busy or answered "already"
    const did = results.filter((r) => r.status === "fulfilled" && !(r.value as { already?: true }).already);
    expect(did).toHaveLength(1);
    const sc = await scores();
    expect(sc.pa.score).toBe(1000);
    expect(sc.pa.correctCount).toBe(1);
    // once settled, a duplicate reveal is an idempotent success
    expect(await host.call("reveal", { pin, qIndex: 0 })).toEqual({ ok: true, already: true });
  });

  it("stale or mismatched step calls", async () => {
    await newGame({ pa: "Ali" });
    await host.call("startGame", { pin });
    expect(await expectCode(host.call("reveal", { pin, qIndex: 1 }))).toBe("functions/failed-precondition");
    expect(await expectCode(host.call("reveal", { pin } as never))).toBe("functions/invalid-argument");
    expect(await expectCode(host.call("reveal", { pin, qIndex: -1 }))).toBe("functions/invalid-argument");
    await adminAnswer(pin, 0, "pa", 1, 0);
    expect(await host.call("reveal", { pin, qIndex: 0 })).toEqual({ ok: true });
    expect(await host.call("nextQuestion", { pin, qIndex: 0 })).toEqual({ ok: true });
    // a second "next" for the same step (double click / retry) does not skip a question
    expect(await host.call("nextQuestion", { pin, qIndex: 0 })).toEqual({ ok: true, already: true });
    expect((await state()).qIndex).toBe(1);
    // reveal/showLeaderboard for a question we already left
    expect(await host.call("reveal", { pin, qIndex: 0 })).toEqual({ ok: true, already: true });
    expect(await host.call("showLeaderboard", { pin, qIndex: 0 })).toEqual({ ok: true, already: true });
    // showLeaderboard for the current, unrevealed question is still an error
    expect(await expectCode(host.call("showLeaderboard", { pin, qIndex: 1 }))).toBe("functions/failed-precondition");
  });

  it("streak bonus, leaderboard phase, nextQuestion past last refused, endGame archives", async () => {
    await newGame();
    await host.call("startGame", { pin });
    // Q0: pa, pb correct; pc wrong
    await adminAnswer(pin, 0, "pa", 1, 0);
    await adminAnswer(pin, 0, "pb", 1, 0);
    await adminAnswer(pin, 0, "pc", 0, 0);
    await host.call("reveal", { pin, qIndex: 0 });
    await host.call("showLeaderboard", { pin, qIndex: 0 });
    expect((await state()).phase).toBe("leaderboard");
    // a stale/duplicate click is an idempotent success, not an error
    expect(await host.call("showLeaderboard", { pin, qIndex: 0 })).toEqual({ ok: true, already: true });

    await host.call("nextQuestion", { pin, qIndex: 0 });
    let s = await state();
    expect(s).toMatchObject({ phase: "question", qIndex: 1 });
    expect(await readRoom(pin, "reveal")).toBeNull();
    const q1 = await readRoom<PublicQuestion>(pin, "question");
    expect(q1.index).toBe(1);
    expect(JSON.stringify(q1)).not.toMatch(/correct/);

    // Q1: pa correct (streak 2), pc correct (streak 1) at the same speed
    await adminAnswer(pin, 1, "pa", 0, 1000);
    await adminAnswer(pin, 1, "pb", 1, 1000);
    await adminAnswer(pin, 1, "pc", 0, 1000);
    await host.call("reveal", { pin, qIndex: 1 });
    let sc = await scores();
    expect(sc.pa.streak).toBe(2);
    expect(sc.pc.streak).toBe(1);
    expect(sc.pa.lastDelta).toBeGreaterThan(sc.pc.lastDelta);
    expect(sc.pb).toMatchObject({ streak: 0, lastDelta: 0 });

    // straight from reveal to Q2
    await host.call("nextQuestion", { pin, qIndex: 1 });
    await adminAnswer(pin, 2, "pa", 2, 0);
    await adminAnswer(pin, 2, "pb", 2, 500);
    await adminAnswer(pin, 2, "pc", 2, 0);
    await host.call("reveal", { pin, qIndex: 2 });
    expect(await expectCode(host.call("nextQuestion", { pin, qIndex: 2 }))).toBe("functions/failed-precondition");
    sc = await scores();

    const { ok, resultId } = await host.call("endGame", { pin });
    expect(ok).toBe(true);
    s = await state();
    expect(s.phase).toBe("ended");
    expect((await readRoom<Leaderboard>(pin, "leaderboard")).top[0].name).toBe("Ali");
    expect((await adminFs().doc(`liveGames/${pin}`).get()).exists).toBe(false);

    const meta = await readRoom<GameMeta>(pin, "meta");
    expect(resultId).toBe(`${pin}_${meta.createdAt}`);
    expect(meta.archived).toBe(true);
    expect((await adminFs().collection("gameResults").get()).size).toBe(1);
    const result = (await adminFs().doc(`gameResults/${resultId}`).get()).data() as GameResultDoc;
    expect(result).toMatchObject({ pin, hostUid: host.uid, quizId: "q1", title: "Test Yarışması", playerCount: 3, questionCount: 3 });
    expect((result.expireAt as unknown as { toMillis(): number }).toMillis()).toBe(
      result.endedAt + club.game.resultsRetentionDays * 86_400_000,
    );
    expect(result.results.map((r) => r.uid)).toEqual(["pa", "pc", "pb"]);
    expect(result.results[0]).toEqual({ uid: "pa", name: "Ali", score: sc.pa.score, rank: 1, correctCount: 3 });
    expect(result.results.map((r) => r.rank)).toEqual([1, 2, 3]);

    // endGame twice → same result, no duplicate archive
    expect(await host.call("endGame", { pin })).toEqual({ ok: true, already: true, resultId });
    expect((await adminFs().collection("gameResults").get()).size).toBe(1);
    // stale "next" after the end
    expect(await host.call("nextQuestion", { pin, qIndex: 2 })).toEqual({ ok: true, already: true });
  });

  it("endGame works straight from the lobby", async () => {
    await newGame({ pa: "Ali" });
    const { resultId } = await host.call("endGame", { pin });
    expect((await state()).phase).toBe("ended");
    const result = (await adminFs().doc(`gameResults/${resultId}`).get()).data() as GameResultDoc;
    expect(result.results).toEqual([{ uid: "pa", name: "Ali", score: 0, rank: 1, correctCount: 0 }]);
  });
});
