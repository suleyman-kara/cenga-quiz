import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  adminFs,
  allowHost,
  anonymousCaller,
  disposeClients,
  expectCode,
  readRoom,
  resetEmulators,
  saveQuiz,
  signInAnon,
  signInGoogle,
  testQuiz,
} from "./helpers";
import type { GameMeta, GameState, LiveGameDoc } from "../../shared/types";

describe("createGame", () => {
  beforeEach(resetEmulators);
  afterAll(disposeClients);

  it("rejects unauthenticated callers", async () => {
    expect(await expectCode(anonymousCaller().call("createGame", { quizId: "x" }))).toBe("functions/unauthenticated");
  });

  it("rejects anonymous users (non-host)", async () => {
    const p = await signInAnon();
    await saveQuiz("q1", p.uid);
    expect(await expectCode(p.call("createGame", { quizId: "q1" }))).toBe("functions/permission-denied");
  });

  it("rejects Google users that are not in allowedHosts", async () => {
    const u = await signInGoogle("stranger1", "stranger@example.com");
    await saveQuiz("q1", u.uid);
    expect(await expectCode(u.call("createGame", { quizId: "q1" }))).toBe("functions/permission-denied");
  });

  it("rejects unverified emails even when listed", async () => {
    await allowHost("unverified@example.com");
    const u = await signInGoogle("unv1", "unverified@example.com", false);
    await saveQuiz("q1", u.uid);
    expect(await expectCode(u.call("createGame", { quizId: "q1" }))).toBe("functions/permission-denied");
  });

  it("host cannot use someone else's quiz", async () => {
    await allowHost("host@example.com");
    const h = await signInGoogle("host1", "host@example.com");
    await saveQuiz("theirs", "someone-else");
    expect(await expectCode(h.call("createGame", { quizId: "theirs" }))).toBe("functions/permission-denied");
  });

  it("not-found for a missing quiz, invalid-argument for a bad id, failed-precondition for an invalid quiz", async () => {
    await allowHost("host@example.com");
    const h = await signInGoogle("host1", "host@example.com");
    expect(await expectCode(h.call("createGame", { quizId: "nope" }))).toBe("functions/not-found");
    expect(await expectCode(h.call("createGame", { quizId: "" }))).toBe("functions/invalid-argument");
    await saveQuiz("bad", h.uid, { title: "Bozuk", questions: [{ text: "?", options: ["tek"], correct: 0 }] });
    expect(await expectCode(h.call("createGame", { quizId: "bad" }))).toBe("functions/failed-precondition");
  });

  it("allowed host creates a game: PIN, RTDB meta/state and private liveGames snapshot", async () => {
    await allowHost("host@example.com");
    const h = await signInGoogle("host1", "host@example.com");
    await saveQuiz("q1", h.uid);
    const { pin } = await h.call("createGame", { quizId: "q1" });
    expect(pin).toMatch(/^[1-9]\d{5}$/);

    const meta = await readRoom<GameMeta>(pin, "meta");
    expect(meta).toMatchObject({ hostUid: h.uid, quizId: "q1", title: testQuiz.title, questionCount: 3 });
    expect(meta.createdAt).toBeGreaterThan(0);
    const state = await readRoom<GameState>(pin, "state");
    expect(state).toMatchObject({ phase: "lobby", qIndex: -1, startedAt: 0, endsAt: 0 });
    expect(await readRoom(pin, "question")).toBeNull();

    const live = (await adminFs().doc(`liveGames/${pin}`).get()).data() as LiveGameDoc;
    expect(live).toMatchObject({ pin, hostUid: h.uid, quizId: "q1" });
    expect(live.quiz.questions[0].correct).toBe(1);
  });

  it("two games get different PINs", async () => {
    await allowHost("host@example.com");
    const h = await signInGoogle("host1", "host@example.com");
    await saveQuiz("q1", h.uid);
    const [a, b] = await Promise.all([h.call("createGame", { quizId: "q1" }), h.call("createGame", { quizId: "q1" })]);
    expect(a.pin).not.toBe(b.pin);
  });
});
