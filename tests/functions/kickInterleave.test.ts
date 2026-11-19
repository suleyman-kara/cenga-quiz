/**
 * Deterministic interleavings of a kick with reveal / start, run in-process against the
 * emulators. `readParts` is wrapped so the transition pauses right after its post-lock read
 * until the kick has had its chance to write — the window the old unlocked kick raced into.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { adminAnswer, adminDb, adminFs, adminJoin, allowHost, readRoom, resetEmulators, testQuiz } from "./helpers";
import type { Leaderboard, PlayerEntry, PlayerScore } from "../../shared/types";
import type { RoomPart } from "../../functions/src/game/rooms";

const gate = vi.hoisted(() => ({
  /** set by a test: called after a transition's post-lock read, before its write */
  afterTransitionRead: undefined as undefined | (() => Promise<void>),
  /** set by a test: called before a kick reads its parts */
  beforeKickRead: undefined as undefined | (() => Promise<void>),
  transitionReads: 0,
}));

vi.mock("../../functions/src/game/rooms", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../functions/src/game/rooms")>();
  return {
    ...orig,
    readParts: async (pin: string, parts: readonly RoomPart[], qIndex: number | undefined) => {
      const isKick = parts.includes("leaderboard") && !parts.includes("answers") && parts.includes("scores");
      if (isKick) await gate.beforeKickRead?.();
      const out = await orig.readParts(pin, parts, qIndex);
      if (!isKick && ++gate.transitionReads === 2) await gate.afterTransitionRead?.();
      return out;
    },
  };
});

const { kickPlayer, reveal, startGame, createGame } = await import("../../functions/src/game/callables");

const HOST = { uid: "host-inproc", token: { email: "host@example.com", email_verified: true } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(pred: () => Promise<boolean>, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await pred()) return;
    await sleep(20);
  }
}

async function retryBusy<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i < 100 && /Başka bir işlem/.test((e as Error).message)) {
        await sleep(20);
        continue;
      }
      throw e;
    }
  }
}

async function lobby(uids: string[]): Promise<string> {
  await adminFs()
    .doc("quizzes/qi")
    .set({ ...testQuiz, ownerUid: HOST.uid, createdAt: 1, updatedAt: 1 });
  const { pin } = await createGame(HOST, { quizId: "qi" });
  for (const [i, uid] of uids.entries()) await adminJoin(pin, uid, `Oyuncu${i}y`);
  return pin;
}

/**
 * Runs `transition` and a kick so that the kick reads the room head before the transition
 * locks, and tries to write after the transition read its inputs.
 */
async function interleave(pin: string, target: string, transition: () => Promise<unknown>): Promise<void> {
  gate.transitionReads = 0;
  let transitionRead!: () => void;
  const readDone = new Promise<void>((r) => (transitionRead = r));
  let kickTried!: () => void;
  const kickDone = new Promise<void>((r) => (kickTried = r));
  gate.afterTransitionRead = async () => {
    transitionRead();
    // give the kick up to 1.5 s to write into the window (it is refused when kicks lock too)
    await Promise.race([kickDone, sleep(1500)]);
    await until(async () => (await readRoom(pin, `players/${target}`)) === null, 300);
  };
  const t = transition();
  const tSettled = t.then(
    () => undefined,
    () => undefined,
  );
  // if the kick wins the lock instead, the transition is refused as busy and never reads
  gate.beforeKickRead = () => Promise.race([readDone, tSettled]);
  const k = kickPlayer(HOST, { pin, uid: target }).finally(() => kickTried());
  const [tr, kr] = await Promise.allSettled([t, k]);
  gate.beforeKickRead = undefined;
  gate.afterTransitionRead = undefined;
  for (const r of [tr, kr]) if (r.status === "rejected") expect((r.reason as Error).message).toMatch(/Başka bir işlem/);
  if (kr.status === "rejected") await retryBusy(() => kickPlayer(HOST, { pin, uid: target }));
  if (tr.status === "rejected") await retryBusy(transition);
}

describe("kick interleaved with transitions (in-process)", () => {
  beforeEach(async () => {
    await resetEmulators();
    await allowHost("host@example.com");
  });

  it("kick landing inside reveal's read→write window leaves no ghost score/leaderboard row", async () => {
    const uids = ["ia", "ib", "ic"];
    const pin = await lobby(uids);
    await startGame(HOST, { pin });
    for (const uid of uids) await adminAnswer(pin, 0, uid, 1, 500);
    await interleave(pin, "ib", () => reveal(HOST, { pin, qIndex: 0 }));
    const scores = (await readRoom<Record<string, PlayerScore>>(pin, "scores")) ?? {};
    const lb = await readRoom<Leaderboard>(pin, "leaderboard");
    expect(Object.keys(scores).sort()).toEqual(["ia", "ic"]);
    expect(lb.playerCount).toBe(2);
    expect(lb.top.map((e) => e.name)).not.toContain("Oyuncu1y");
  });

  it("kick landing inside start's read→write window never re-creates the banned player", async () => {
    const pin = await lobby(["ja", "jb", "jc"]);
    await adminDb().ref(`games/${pin}/players/jc/name`).set("Oyuncu0y"); // start will rename jc
    await interleave(pin, "jc", () => startGame(HOST, { pin }));
    expect(await readRoom<PlayerEntry | null>(pin, "players/jc")).toBeNull();
    expect(await readRoom(pin, "banned/jc")).toBe(true);
  });
});
