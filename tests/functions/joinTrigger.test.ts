/**
 * Join/leave database triggers (functions emulator): names are sanitized right after joining,
 * meta.playerCount / meta.full / meta.lastActivityAt are maintained. Triggers run
 * asynchronously, so assertions poll.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { ref, set, remove, serverTimestamp } from "firebase/database";
import {
  adminDb,
  allowHost,
  disposeClients,
  readRoom,
  resetEmulators,
  saveQuiz,
  signInAnon,
  signInGoogle,
  type Client,
} from "./helpers";
import { club } from "../../src/club.config";
import type { GameMeta, PlayerEntry } from "../../shared/types";

let pin: string;

async function newGame() {
  await allowHost("host@example.com");
  const host = await signInGoogle("host1", "host@example.com");
  await saveQuiz("q1", host.uid);
  ({ pin } = await host.call("createGame", { quizId: "q1" }));
}

const join = (c: Client, name: string) =>
  set(ref(c.db, `games/${pin}/players/${c.uid}`), { name, joinedAt: serverTimestamp() });
const leave = (c: Client) => remove(ref(c.db, `games/${pin}/players/${c.uid}`));

async function eventually<T>(read: () => Promise<T>, pred: (v: T) => boolean, ms = 15_000): Promise<T> {
  const end = Date.now() + ms;
  let v = await read();
  while (!pred(v)) {
    if (Date.now() > end) throw new Error(`condition not met in ${ms} ms; last value: ${JSON.stringify(v)}`);
    await new Promise((r) => setTimeout(r, 100));
    v = await read();
  }
  return v;
}
const meta = () => readRoom<GameMeta>(pin, "meta");
const nameOf = (uid: string) => async () => (await readRoom<PlayerEntry | null>(pin, `players/${uid}`))?.name;

describe("join/leave triggers", () => {
  beforeEach(resetEmulators);
  afterAll(disposeClients);

  it("sanitizes a blocked name and suffixes a case-insensitive duplicate right after joining", async () => {
    await newGame();
    const [a, b, c] = await Promise.all([signInAnon(), signInAnon(), signInAnon()]);
    await join(a, "Ali");
    await join(b, "ALİ");
    await join(c, "s1kt1r");
    expect(await eventually(nameOf(b.uid), (n) => n === "ALİ (2)")).toBe("ALİ (2)");
    expect(await eventually(nameOf(c.uid), (n) => n === "Oyuncu 1")).toBe("Oyuncu 1");
    expect(await nameOf(a.uid)()).toBe("Ali");
    // the entry stays complete (joinedAt kept)
    expect(typeof (await readRoom<PlayerEntry>(pin, `players/${c.uid}`)).joinedAt).toBe("number");
  });

  it("maintains meta.playerCount and meta.lastActivityAt on joins and leaves", async () => {
    await newGame();
    const ps = await Promise.all([signInAnon(), signInAnon(), signInAnon()]);
    for (const [i, p] of ps.entries()) await join(p, `Kişi${i}`);
    const m = await eventually(meta, (v) => v.playerCount === 3);
    const players = await readRoom<Record<string, PlayerEntry>>(pin, "players");
    const lastJoin = Math.max(...Object.values(players).map((p) => p.joinedAt));
    expect(await eventually(meta, (v) => v.lastActivityAt === lastJoin)).toMatchObject({ full: false });
    expect(m.hostUid).toBeTruthy();
    await leave(ps[0]);
    expect((await eventually(meta, (v) => v.playerCount === 2)).playerCount).toBe(2);
  });

  it("marks the lobby full at club.game.maxPlayers (joins rejected) and reopens it when someone leaves", async () => {
    await newGame();
    // pretend maxPlayers - 1 players are already counted (joining 300 real players is too slow here)
    await adminDb().ref(`games/${pin}/meta/playerCount`).set(club.game.maxPlayers - 1);
    const [last, late] = await Promise.all([signInAnon(), signInAnon()]);
    await join(last, "Sonuncu");
    expect(await eventually(meta, (v) => v.full === true)).toMatchObject({ playerCount: club.game.maxPlayers });
    await expect(join(late, "Geç")).rejects.toThrow();
    await leave(last);
    expect(await eventually(meta, (v) => v.full === false)).toMatchObject({ playerCount: club.game.maxPlayers - 1 });
    await join(late, "Geç");
    expect(await eventually(meta, (v) => v.full === true)).toBeTruthy();
  });

  it("does not resurrect a room or a player that is gone by the time the trigger runs", async () => {
    await newGame();
    const p = await signInAnon();
    await join(p, "orospu");
    await adminDb().ref(`games/${pin}`).remove();
    await new Promise((r) => setTimeout(r, 1500));
    expect(await readRoom(pin)).toBeNull();
  });
});
