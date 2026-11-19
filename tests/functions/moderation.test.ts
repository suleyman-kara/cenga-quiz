import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { ref, set, serverTimestamp } from "firebase/database";
import {
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
import type { GameMeta, PlayerEntry } from "../../shared/types";

let host: Client;
let pin: string;

async function newGame() {
  await allowHost("host@example.com");
  host = await signInGoogle("host1", "host@example.com");
  await saveQuiz("q1", host.uid);
  ({ pin } = await host.call("createGame", { quizId: "q1" }));
}

const join = (c: Client, name: string) =>
  set(ref(c.db, `games/${pin}/players/${c.uid}`), { name, joinedAt: serverTimestamp() });

describe("moderation (kickPlayer / setLobbyLocked)", () => {
  beforeEach(resetEmulators);
  afterAll(disposeClients);

  it("kickPlayer removes and bans a player; they cannot rejoin", async () => {
    await newGame();
    const p = await signInAnon();
    await join(p, "Kaba");
    await adminJoin(pin, "pb", "Banu");
    expect(await host.call("kickPlayer", { pin, uid: p.uid })).toEqual({ ok: true });
    expect(await readRoom(pin, `players/${p.uid}`)).toBeNull();
    expect(await readRoom(pin, `banned/${p.uid}`)).toBe(true);
    await expect(join(p, "Kaba2")).rejects.toThrow();
    expect(await readRoom<PlayerEntry>(pin, "players/pb")).toMatchObject({ name: "Banu" });
  });

  it("only the host may kick or lock; bad arguments are rejected", async () => {
    await newGame();
    await adminJoin(pin, "pa", "Ali");
    const p = await signInAnon();
    expect(await expectCode(p.call("kickPlayer", { pin, uid: "pa" }))).toBe("functions/permission-denied");
    expect(await expectCode(p.call("setLobbyLocked", { pin, locked: true }))).toBe("functions/permission-denied");
    expect(await expectCode(host.call("kickPlayer", { pin, uid: "a/b" }))).toBe("functions/invalid-argument");
    expect(await expectCode(host.call("setLobbyLocked", { pin, locked: "yes" as never }))).toBe(
      "functions/invalid-argument",
    );
  });

  it("setLobbyLocked closes and reopens the lobby", async () => {
    await newGame();
    expect(await host.call("setLobbyLocked", { pin, locked: true })).toEqual({ ok: true, locked: true });
    expect((await readRoom<GameMeta>(pin, "meta")).locked).toBe(true);
    const p = await signInAnon();
    await expect(join(p, "Geç")).rejects.toThrow();
    await host.call("setLobbyLocked", { pin, locked: false });
    await join(p, "Geç");
    expect(await readRoom<PlayerEntry>(pin, `players/${p.uid}`)).toMatchObject({ name: "Geç" });
  });

  it("startGame keeps the earliest maxPlayers players instead of failing", async () => {
    // the emulator runs with club.game.maxPlayers; joining that many is too slow, so this is
    // covered by the planStart unit test — here we only check that a normal start keeps everyone.
    await newGame();
    await adminJoin(pin, "pa", "Ali");
    await adminJoin(pin, "pb", "Banu");
    await host.call("startGame", { pin });
    expect(Object.keys((await readRoom<Record<string, PlayerEntry>>(pin, "players")) ?? {}).sort()).toEqual(["pa", "pb"]);
  });
});
