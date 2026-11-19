/**
 * End-to-end with the real Security Rules: players join and answer through the client SDK,
 * the host drives the game through callables.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { ref, set, get, onValue, serverTimestamp } from "firebase/database";
import {
  allowHost,
  disposeClients,
  readRoom,
  resetEmulators,
  saveQuiz,
  signInAnon,
  signInGoogle,
  type Client,
} from "./helpers";
import type { GameState, PlayerScore, PublicQuestion } from "../../shared/types";

function waitFor<T>(c: Client, path: string, pred: (v: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`timeout waiting for ${path}`));
    }, 10_000);
    const unsub = onValue(
      ref(c.db, path),
      (snap) => {
        const v = snap.val() as T;
        if (v !== null && pred(v)) {
          clearTimeout(timer);
          unsub();
          resolve(v);
        }
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

describe("client SDK end-to-end", () => {
  beforeEach(resetEmulators);
  afterAll(disposeClients);

  it("3 players join and answer via the client SDK; host reveals and ends", async () => {
    await allowHost("host@example.com");
    const host = await signInGoogle("host1", "host@example.com");
    await saveQuiz("q1", host.uid);
    const { pin } = await host.call("createGame", { quizId: "q1" });

    const names = ["Ali", "Banu", "Cem"];
    const players = await Promise.all(names.map(() => signInAnon()));
    for (const [i, p] of players.entries()) {
      await set(ref(p.db, `games/${pin}/players/${p.uid}`), { name: names[i], joinedAt: serverTimestamp() });
    }
    await host.call("startGame", { pin });

    for (const [i, p] of players.entries()) {
      const s = await waitFor<GameState>(p, `games/${pin}/state`, (v) => v.phase === "question");
      expect(s.qIndex).toBe(0);
      const q = (await get(ref(p.db, `games/${pin}/question`))).val() as PublicQuestion;
      expect(q.options).toHaveLength(4);
      expect(JSON.stringify(q)).not.toMatch(/correct/);
      // Ali and Banu correct (1), Cem wrong (0)
      await set(ref(p.db, `games/${pin}/answers/0/${p.uid}`), { choice: i < 2 ? 1 : 0, at: serverTimestamp() });
      await new Promise((r) => setTimeout(r, 150));
    }

    await host.call("reveal", { pin });
    const scores = await readRoom<Record<string, PlayerScore>>(pin, "scores");
    const [a, b, c] = players.map((p) => scores[p.uid]);
    expect(a.lastCorrect && b.lastCorrect).toBe(true);
    expect(a.score).toBeGreaterThanOrEqual(b.score);
    expect(c).toMatchObject({ score: 0, lastAnswered: true, lastCorrect: false });

    // each player sees the reveal and their own score
    const own = await waitFor<PlayerScore>(players[0], `games/${pin}/scores/${players[0].uid}`, () => true);
    expect(own.score).toBe(a.score);

    await host.call("endGame", { pin });
    const ended = await waitFor<GameState>(players[2], `games/${pin}/state`, (v) => v.phase === "ended");
    expect(ended.phase).toBe("ended");
  });
});
