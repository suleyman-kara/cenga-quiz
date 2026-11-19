/**
 * Host transitions must not be starved by concurrent player writes elsewhere in the room.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { ref, set, remove, serverTimestamp } from "firebase/database";
import {
  adminJoin,
  allowHost,
  disposeClients,
  readRoom,
  resetEmulators,
  saveQuiz,
  signInAnon,
  signInGoogle,
} from "./helpers";
import type { GameState } from "../../shared/types";

describe("transition contention", () => {
  beforeEach(resetEmulators);
  afterAll(disposeClients);

  it("players spamming their lobby entries do not make startGame fail", async () => {
    await allowHost("host@example.com");
    const host = await signInGoogle("host1", "host@example.com");
    await saveQuiz("q1", host.uid);
    const { pin } = await host.call("createGame", { quizId: "q1" });
    await adminJoin(pin, "stable1", "Sabit");

    const spammers = await Promise.all(Array.from({ length: 12 }, () => signInAnon()));
    let stop = false;
    let writes = 0;
    const loops = spammers.map(async (p, i) => {
      const r = ref(p.db, `games/${pin}/players/${p.uid}`);
      while (!stop) {
        try {
          await set(r, { name: `Spam${i}`, joinedAt: serverTimestamp() });
          writes++;
          await remove(r);
          writes++;
        } catch {
          // denied once the game has started — expected
          await new Promise((res) => setTimeout(res, 5));
        }
      }
    });
    // let the spam reach full speed first
    while (writes < 60) await new Promise((res) => setTimeout(res, 20));
    try {
      await host.call("startGame", { pin });
    } finally {
      stop = true;
      await Promise.all(loops);
    }
    expect((await readRoom<GameState>(pin, "state")).phase).toBe("question");
  });
});
