/**
 * Kicks run under the same state lock as transitions: a kick racing reveal/start must never
 * leave a ghost score/leaderboard row or re-create the kicked (banned) player.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  adminAnswer,
  adminDb,
  adminJoin,
  allowHost,
  disposeClients,
  expectCode,
  openAnswering,
  readRoom,
  resetEmulators,
  saveQuiz,
  signInGoogle,
  type Client,
} from "./helpers";
import type { Leaderboard, PlayerEntry, PlayerScore } from "../../shared/types";

const ROUNDS = 6;
/** kick fired this long after the transition: sweeps the window between its lock and its write */
const delay = (round: number) => (round % 6) * 15;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries while another host step holds the lock ("Başka bir işlem sürüyor"), like the client does. */
async function retryBusy<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const { code, message } = e as { code?: string; message?: string };
      if (i < 100 && code === "functions/failed-precondition" && /Başka bir işlem/.test(message ?? "")) {
        await sleep(10 + Math.random() * 20);
        continue;
      }
      throw e;
    }
  }
}

let host: Client;

async function lobbyWith(uids: string[]): Promise<string> {
  const { pin } = await host.call("createGame", { quizId: "q1" });
  for (const [i, uid] of uids.entries()) await adminJoin(pin, uid, `Oyuncu${i}x`);
  return pin;
}

describe("kick vs transitions (state lock)", () => {
  beforeEach(async () => {
    await resetEmulators();
    await allowHost("host@example.com");
    host = await signInGoogle("host1", "host@example.com");
    await saveQuiz("q1", host.uid);
  });
  afterAll(disposeClients);

  it("kick racing reveal never leaves a ghost score or leaderboard row", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const uids = ["a", "b", "c", "d"].map((x) => `r${round}${x}`);
      const pin = await lobbyWith(uids);
      await host.call("startGame", { pin });
      await openAnswering(pin);
      for (const uid of uids) await adminAnswer(pin, 0, uid, 1, 500);
      const target = uids[round % uids.length];
      await Promise.all([
        retryBusy(() => host.call("reveal", { pin, qIndex: 0 })),
        sleep(delay(round)).then(() => retryBusy(() => host.call("kickPlayer", { pin, uid: target }))),
      ]);
      const scores = (await readRoom<Record<string, PlayerScore>>(pin, "scores")) ?? {};
      const lb = await readRoom<Leaderboard>(pin, "leaderboard");
      const players = (await readRoom<Record<string, PlayerEntry>>(pin, "players")) ?? {};
      expect(Object.keys(scores).sort(), `round ${round}`).toEqual(uids.filter((u) => u !== target).sort());
      expect(Object.keys(players).sort()).toEqual(uids.filter((u) => u !== target).sort());
      expect(lb.playerCount).toBe(3);
      expect(lb.top).toHaveLength(3);
      expect(await readRoom(pin, `banned/${target}`)).toBe(true);
    }
  });

  it("kick racing start never re-creates the banned player", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const uids = ["a", "b", "c"].map((x) => `s${round}${x}`);
      const pin = await lobbyWith(uids);
      // a duplicate name makes start rename the target (the path that used to re-create it)
      const target = uids[2];
      await adminDb().ref(`games/${pin}/players/${target}/name`).set("Oyuncu0x");
      await Promise.all([
        retryBusy(() => host.call("startGame", { pin })),
        sleep(delay(round)).then(() => retryBusy(() => host.call("kickPlayer", { pin, uid: target }))),
      ]);
      expect(await readRoom(pin, `players/${target}`), `round ${round}`).toBeNull();
      expect(await readRoom(pin, `banned/${target}`)).toBe(true);
      expect(await readRoom(pin, "state/phase")).toBe("question");
    }
  });

  it("a kick while another host step holds the lock is refused (retryable) and changes nothing", async () => {
    const pin = await lobbyWith(["la", "lb"]);
    await adminDb().ref(`games/${pin}/state/lock`).set({ by: "start", at: Date.now() });
    const err = await host.call("kickPlayer", { pin, uid: "la" }).catch((e) => e as { code: string; message: string });
    expect((err as { code: string }).code).toBe("functions/failed-precondition");
    expect((err as { message: string }).message).toMatch(/Başka bir işlem sürüyor/);
    expect(await readRoom(pin, "players/la")).not.toBeNull();
    expect(await readRoom(pin, "banned/la")).toBeNull();
    // the kick takes and releases the lock itself
    await adminDb().ref(`games/${pin}/state/lock`).remove();
    await host.call("kickPlayer", { pin, uid: "la" });
    expect(await readRoom(pin, "state/lock")).toBeNull();
    expect(await readRoom(pin, "players/la")).toBeNull();
  });

  it("kickPlayers removes and bans many players at once (max 100 uids)", async () => {
    const pin = await lobbyWith(["ka", "kb", "kc"]);
    expect(await host.call("kickPlayers", { pin, uids: ["ka", "kc"] })).toEqual({ ok: true });
    expect(Object.keys((await readRoom<Record<string, PlayerEntry>>(pin, "players")) ?? {})).toEqual(["kb"]);
    expect(await readRoom(pin, "banned")).toEqual({ ka: true, kc: true });
    expect(await readRoom(pin, "state/lock")).toBeNull();
    const many = Array.from({ length: 101 }, (_, i) => `u${i}`);
    expect(await expectCode(host.call("kickPlayers", { pin, uids: many }))).toBe("functions/invalid-argument");
    expect(await expectCode(host.call("kickPlayers", { pin, uids: [] }))).toBe("functions/invalid-argument");
    expect(await expectCode(host.call("kickPlayers", { pin, uids: ["a/b"] }))).toBe("functions/invalid-argument");
  });
});
