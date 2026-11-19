import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { serverTimestamp } from "firebase/database";
import type { GameMeta, GameState, Phase } from "../../shared/types";
import { anonToken, createEnv, disposeClients, HOST_UID, hostToken, rtdbAs } from "./helpers";

const PIN = "123456";
const G = `games/${PIN}`;
const P1 = "player-1";
const P2 = "player-2";
const OUTSIDER = "player-3";

let env: RulesTestEnvironment;

const host = () => rtdbAs({ uid: HOST_UID, token: hostToken });
const player = (uid: string) => rtdbAs({ uid, token: anonToken });
const unauth = () => rtdbAs(null);
const owner = () => rtdbAs("owner");

interface SeedOpts {
  phase?: Phase;
  qIndex?: number;
  endsAt?: number;
  withMeta?: boolean;
  answers?: Record<string, Record<string, { choice: number; at: number }>>;
}

async function seed(opts: SeedOpts = {}) {
  const phase = opts.phase ?? "lobby";
  const qIndex = opts.qIndex ?? (phase === "lobby" ? -1 : 0);
  const now = Date.now();
  const meta: GameMeta = { hostUid: HOST_UID, quizId: "quiz-1", title: "Test", createdAt: now, questionCount: 3 };
  const state: GameState = {
    phase,
    qIndex,
    startedAt: phase === "question" ? now - 5000 : 0,
    endsAt: opts.endsAt ?? (phase === "question" ? now + 60_000 : 0),
    updatedAt: now,
  };
  const game: Record<string, unknown> = {
    state,
    question: { index: qIndex, text: "Soru?", options: ["A", "B", "C", "D"], seconds: 20 },
    reveal: { qIndex: 0, correct: 1, counts: [0, 1, 0, 0] },
    players: {
      [P1]: { name: "Ayşe", joinedAt: now - 10_000 },
      [P2]: { name: "Mehmet", joinedAt: now - 9_000 },
    },
    scores: {
      [P1]: { score: 900, streak: 1, rank: 1, lastDelta: 900, lastCorrect: true, lastAnswered: true, correctCount: 1 },
      [P2]: { score: 0, streak: 0, rank: 2, lastDelta: 0, lastCorrect: false, lastAnswered: false, correctCount: 0 },
    },
    leaderboard: { top: [{ name: "Ayşe", score: 900, rank: 1 }], playerCount: 2 },
    answers: opts.answers ?? {},
  };
  if (opts.withMeta !== false) game.meta = meta;
  await owner().ref(G).set(game);
}

beforeAll(async () => {
  env = await createEnv("database");
});
afterAll(async () => {
  await disposeClients();
  await env?.cleanup();
});
beforeEach(async () => {
  await owner().ref("/").set(null);
});
afterEach(async () => {
  await disposeClients();
});

describe("RTDB: default deny", () => {
  it("denies reading the root and the games list", async () => {
    await seed();
    await assertFails(host().ref("/").get());
    await assertFails(host().ref("games").get());
    await assertFails(player(P1).ref(G).get());
  });
  it("denies writing arbitrary paths", async () => {
    await assertFails(player(P1).ref("other/x").set(1));
    await assertFails(host().ref(`${G}/somethingElse`).set(1));
  });
});

describe("RTDB: public game nodes", () => {
  const nodes = ["meta", "state", "question", "reveal", "leaderboard"];
  it.each(["meta", "state"])("any signed-in user may read %s (join check)", async (node) => {
    await seed({ phase: "question" });
    await assertSucceeds(player(OUTSIDER).ref(`${G}/${node}`).get());
    await assertSucceeds(host().ref(`${G}/${node}`).get());
  });
  it.each(["question", "reveal", "leaderboard"])("%s is readable only by the host and joined players", async (node) => {
    await seed({ phase: "question" });
    await assertSucceeds(host().ref(`${G}/${node}`).get());
    await assertSucceeds(player(P1).ref(`${G}/${node}`).get());
    await assertFails(player(OUTSIDER).ref(`${G}/${node}`).get());
  });
  it("a kicked player loses access to question/reveal/leaderboard", async () => {
    await seed({ phase: "question" });
    await owner().ref(`${G}/players/${P1}`).remove();
    await owner().ref(`${G}/banned/${P1}`).set(true);
    await assertFails(player(P1).ref(`${G}/question`).get());
    await assertSucceeds(player(P1).ref(`${G}/state`).get());
  });
  it("banned/{uid} is readable by that uid and the host only", async () => {
    await seed();
    await owner().ref(`${G}/banned/${OUTSIDER}`).set(true);
    const snap = await assertSucceeds(player(OUTSIDER).ref(`${G}/banned/${OUTSIDER}`).get());
    expect(snap.val()).toBe(true);
    await assertSucceeds(player(P1).ref(`${G}/banned/${P1}`).get()); // own (absent) entry
    await assertFails(player(P1).ref(`${G}/banned/${OUTSIDER}`).get());
    await assertFails(player(P1).ref(`${G}/banned`).get());
    await assertSucceeds(host().ref(`${G}/banned`).get());
    await assertSucceeds(host().ref(`${G}/banned/${OUTSIDER}`).get());
  });
  it.each(nodes)("unauthenticated users may not read %s", async (node) => {
    await seed({ phase: "question" });
    await assertFails(unauth().ref(`${G}/${node}`).get());
  });
  const serverOnly = ["meta", "state", "question", "reveal", "scores", "leaderboard"];
  it.each(serverOnly)("player may not write %s", async (node) => {
    await seed({ phase: "question" });
    await assertFails(player(P1).ref(`${G}/${node}`).set({ x: 1 }));
    await assertFails(player(P1).ref(`${G}/${node}`).remove());
  });
  it.each(serverOnly)("host may not write %s", async (node) => {
    await seed({ phase: "question" });
    await assertFails(host().ref(`${G}/${node}`).set({ x: 1 }));
    await assertFails(host().ref(`${G}/${node}`).remove());
  });
  it("player may not write own score or forge state fields", async () => {
    await seed({ phase: "question" });
    await assertFails(player(P1).ref(`${G}/scores/${P1}/score`).set(99999));
    await assertFails(player(P1).ref(`${G}/state/endsAt`).set(Date.now() + 999_999));
    await assertFails(host().ref(`${G}/state/phase`).set("reveal"));
    await assertFails(player(P1).ref(`${G}/leaderboard/top/0/score`).set(1));
  });
  it("nobody may create a new game from the client", async () => {
    await assertFails(host().ref("games/999999/meta").set({ hostUid: HOST_UID }));
    await assertFails(host().ref("games/999999").set({ meta: { hostUid: HOST_UID } }));
  });
});

describe("RTDB: players read", () => {
  it("host reads all players", async () => {
    await seed();
    const snap = await assertSucceeds(host().ref(`${G}/players`).get());
    expect(Object.keys(snap.val())).toHaveLength(2);
  });
  it("player reads own entry only", async () => {
    await seed();
    await assertSucceeds(player(P1).ref(`${G}/players/${P1}`).get());
    await assertFails(player(P1).ref(`${G}/players/${P2}`).get());
    await assertFails(player(P1).ref(`${G}/players`).get());
  });
  it("another (non-host) signed-in user cannot list players", async () => {
    await seed();
    await assertFails(player(OUTSIDER).ref(`${G}/players`).get());
  });
});

describe("RTDB: joining (players/{uid} write)", () => {
  const join = (uid: string, name: string, extra: Record<string, unknown> = {}) =>
    player(uid).ref(`${G}/players/${uid}`).set({ name, joinedAt: serverTimestamp(), ...extra });

  it("allows joining in lobby with a valid name", async () => {
    await seed();
    await assertSucceeds(join(OUTSIDER, "Ali"));
  });
  it.each(["Çağrı Öztürk", "İğdeli Şükrü", "ışık_ğüş.ÇĞİÖŞÜ-1", "ÇĞİÖŞÜçğıöşü12345678"])(
    "allows Turkish name %s",
    async (name) => {
      await seed();
      await assertSucceeds(join(OUTSIDER, name));
    },
  );
  it.each([
    ["empty", ""],
    ["too long (21 ascii)", "a".repeat(21)],
    ["too long (21 Turkish)", "ş".repeat(21)],
    ["emoji", "Ali 😀"],
    ["html", "<b>x</b>"],
    ["newline", "Ali\nVeli"],
    ["other unicode letter", "Zoë"],
    ["leading space", " Ali"],
    ["trailing space", "Ali "],
    ["double space", "Ali  Veli"],
    ["only a space", " "],
  ])("rejects invalid name: %s", async (_label, name) => {
    await seed();
    await assertFails(join(OUTSIDER, name));
  });
  it("rejects a non-string name", async () => {
    await seed();
    await assertFails(player(OUTSIDER).ref(`${G}/players/${OUTSIDER}`).set({ name: 123, joinedAt: serverTimestamp() }));
  });
  it("rejects a client-forged joinedAt", async () => {
    await seed();
    await assertFails(player(OUTSIDER).ref(`${G}/players/${OUTSIDER}`).set({ name: "Ali", joinedAt: Date.now() }));
    await assertFails(player(OUTSIDER).ref(`${G}/players/${OUTSIDER}`).set({ name: "Ali", joinedAt: "now" }));
  });
  it("rejects missing fields", async () => {
    await seed();
    await assertFails(player(OUTSIDER).ref(`${G}/players/${OUTSIDER}`).set({ name: "Ali" }));
    await assertFails(player(OUTSIDER).ref(`${G}/players/${OUTSIDER}`).set({ joinedAt: serverTimestamp() }));
  });
  it("rejects extra fields", async () => {
    await seed();
    await assertFails(join(OUTSIDER, "Ali", { score: 1000 }));
    await assertFails(join(OUTSIDER, "Ali", { isHost: true }));
  });
  it("rejects writing someone else's entry", async () => {
    await seed();
    await assertFails(player(OUTSIDER).ref(`${G}/players/${P1}`).set({ name: "Hacker", joinedAt: serverTimestamp() }));
    await assertFails(player(OUTSIDER).ref(`${G}/players/${P1}`).remove());
  });
  it("rejects unauthenticated joins", async () => {
    await seed();
    await assertFails(unauth().ref(`${G}/players/anon`).set({ name: "Ali", joinedAt: serverTimestamp() }));
  });
  it.each(["question", "reveal", "leaderboard", "ended"] as Phase[])("rejects joining in phase %s", async (phase) => {
    await seed({ phase });
    await assertFails(join(OUTSIDER, "Ali"));
  });
  it("rejects joining a game that does not exist", async () => {
    await assertFails(player(OUTSIDER).ref(`games/000000/players/${OUTSIDER}`).set({ name: "Ali", joinedAt: serverTimestamp() }));
  });
  it("rejects joining a game without meta even if state says lobby", async () => {
    await seed({ withMeta: false });
    await assertFails(join(OUTSIDER, "Ali"));
  });
  it("host may join as a player too", async () => {
    await seed();
    await assertSucceeds(host().ref(`${G}/players/${HOST_UID}`).set({ name: "Sunucu", joinedAt: serverTimestamp() }));
  });
  it("entries are write-once: no rename, no rewrite, no field updates", async () => {
    await seed();
    await assertFails(player(P1).ref(`${G}/players/${P1}`).update({ name: "Ayşe K" }));
    await assertFails(player(P1).ref(`${G}/players/${P1}/name`).set("Ayşe Y"));
    await assertFails(player(P1).ref(`${G}/players/${P1}`).set({ name: "Ayşe Z", joinedAt: serverTimestamp() }));
  });
  it("a player may leave and join again", async () => {
    await seed();
    await assertSucceeds(player(P1).ref(`${G}/players/${P1}`).remove());
    await assertSucceeds(join(P1, "Ayşe"));
  });
  it("a banned (kicked) player may not join again", async () => {
    await seed();
    await owner().ref(`${G}/banned/${OUTSIDER}`).set(true);
    await assertFails(join(OUTSIDER, "Ali"));
    await assertSucceeds(join("someone-else", "Veli"));
  });
  it("a locked lobby rejects new joins but still allows leaving", async () => {
    await seed();
    await owner().ref(`${G}/meta/locked`).set(true);
    await assertFails(join(OUTSIDER, "Ali"));
    await assertSucceeds(player(P1).ref(`${G}/players/${P1}`).remove());
    await owner().ref(`${G}/meta/locked`).set(false);
    await assertSucceeds(join(OUTSIDER, "Ali"));
  });
  it("clients may not write banned or meta.locked", async () => {
    await seed();
    await assertFails(host().ref(`${G}/banned/${P1}`).set(true));
    await assertFails(player(P1).ref(`${G}/banned/${P1}`).remove());
    await assertFails(host().ref(`${G}/meta/locked`).set(true));
  });
  it("player may not change joinedAt to an arbitrary value", async () => {
    await seed();
    await assertFails(player(P1).ref(`${G}/players/${P1}/joinedAt`).set(1));
  });
  it("player may not rename outside the lobby", async () => {
    await seed({ phase: "question" });
    await assertFails(player(P1).ref(`${G}/players/${P1}`).update({ name: "Yeni" }));
  });
  it("player may leave (delete own entry) in lobby", async () => {
    await seed();
    await assertSucceeds(player(P1).ref(`${G}/players/${P1}`).remove());
  });
  it("player may not leave once the game started", async () => {
    await seed({ phase: "question" });
    await assertFails(player(P1).ref(`${G}/players/${P1}`).remove());
  });
  it("player may not delete a child field leaving a partial entry", async () => {
    await seed();
    await assertFails(player(P1).ref(`${G}/players/${P1}/name`).remove());
  });
});

describe("RTDB: answers", () => {
  const answer = (uid: string, q: number | string, choice: unknown, extra: Record<string, unknown> = {}) =>
    player(uid).ref(`${G}/answers/${q}/${uid}`).set({ choice, at: serverTimestamp(), ...extra });

  it("allows a joined player to answer the current question in time", async () => {
    await seed({ phase: "question", qIndex: 0 });
    await assertSucceeds(answer(P1, 0, 2));
  });
  it("rejects answers from a banned uid even if a (partial) players entry is left behind", async () => {
    await seed({ phase: "question", qIndex: 0 });
    await owner().ref(`${G}/banned/${P2}`).set(true);
    await assertFails(answer(P2, 0, 1));
    await assertSucceeds(answer(P1, 0, 1));
  });
  it("allows answering when qIndex > 0", async () => {
    await seed({ phase: "question", qIndex: 2 });
    await assertSucceeds(answer(P1, 2, 0));
    await assertSucceeds(answer(P2, 2, 3));
  });
  it("rejects answering during the lead-in (before state.startedAt)", async () => {
    await seed({ phase: "question", qIndex: 0 });
    await owner().ref(`${G}/state/startedAt`).set(Date.now() + 60_000);
    await assertFails(answer(P1, 0, 1));
    await owner().ref(`${G}/state/startedAt`).set(Date.now() - 1000);
    await assertSucceeds(answer(P1, 0, 1));
  });
  it("rejects answering after endsAt", async () => {
    await seed({ phase: "question", qIndex: 0, endsAt: Date.now() - 1000 });
    await assertFails(answer(P1, 0, 1));
  });
  it("rejects answering twice (no update, no delete)", async () => {
    await seed({ phase: "question", qIndex: 0 });
    await assertSucceeds(answer(P1, 0, 1));
    await assertFails(answer(P1, 0, 2));
    await assertFails(player(P1).ref(`${G}/answers/0/${P1}/choice`).set(3));
    await assertFails(player(P1).ref(`${G}/answers/0/${P1}`).remove());
  });
  it("rejects answering a different qIndex", async () => {
    await seed({ phase: "question", qIndex: 1 });
    await assertFails(answer(P1, 0, 1));
    await assertFails(answer(P1, 2, 1));
    await assertFails(answer(P1, "01", 1));
  });
  it.each(["lobby", "reveal", "leaderboard", "ended"] as Phase[])("rejects answering in phase %s", async (phase) => {
    await seed({ phase, qIndex: 0, endsAt: Date.now() + 60_000 });
    await assertFails(answer(P1, 0, 1));
  });
  it("rejects answers from users who have not joined", async () => {
    await seed({ phase: "question", qIndex: 0 });
    await assertFails(answer(OUTSIDER, 0, 1));
  });
  it("rejects answering on behalf of someone else", async () => {
    await seed({ phase: "question", qIndex: 0 });
    await assertFails(player(P1).ref(`${G}/answers/0/${P2}`).set({ choice: 1, at: serverTimestamp() }));
  });
  it("host may not write answers", async () => {
    await seed({ phase: "question", qIndex: 0 });
    await assertFails(host().ref(`${G}/answers/0/${P1}`).set({ choice: 1, at: serverTimestamp() }));
    await assertFails(host().ref(`${G}/answers`).remove());
  });
  it.each([
    ["negative", -1],
    ["out of range", 4],
    ["far out of range", 100],
    ["non-integer", 1.5],
    ["string", "1"],
    ["boolean", true],
    ["null-ish object", { v: 1 }],
  ])("rejects invalid choice: %s", async (_label, choice) => {
    await seed({ phase: "question", qIndex: 0 });
    await assertFails(answer(P1, 0, choice));
  });
  it("respects the actual option count (2-option question)", async () => {
    await seed({ phase: "question", qIndex: 0 });
    await owner().ref(`${G}/question/options`).set(["Doğru", "Yanlış"]);
    await assertFails(answer(P1, 0, 2));
    await assertSucceeds(answer(P1, 0, 1));
  });
  it("rejects a client-forged `at`", async () => {
    await seed({ phase: "question", qIndex: 0 });
    await assertFails(player(P1).ref(`${G}/answers/0/${P1}`).set({ choice: 1, at: Date.now() }));
    await assertFails(player(P1).ref(`${G}/answers/0/${P1}`).set({ choice: 1, at: 0 }));
  });
  it("rejects missing or extra fields", async () => {
    await seed({ phase: "question", qIndex: 0 });
    await assertFails(player(P1).ref(`${G}/answers/0/${P1}`).set({ choice: 1 }));
    await assertFails(player(P1).ref(`${G}/answers/0/${P1}`).set({ at: serverTimestamp() }));
    await assertFails(answer(P1, 0, 1, { correct: true }));
  });

  describe("reading answers", () => {
    const answers = { "0": { [P1]: { choice: 1, at: 1 }, [P2]: { choice: 2, at: 2 } } };
    it("host reads all answers", async () => {
      await seed({ phase: "question", qIndex: 0, answers });
      await assertSucceeds(host().ref(`${G}/answers`).get());
      await assertSucceeds(host().ref(`${G}/answers/0`).get());
    });
    it("player reads own answer", async () => {
      await seed({ phase: "question", qIndex: 0, answers });
      const snap = await assertSucceeds(player(P1).ref(`${G}/answers/0/${P1}`).get());
      expect(snap.val().choice).toBe(1);
    });
    it("player may NOT read others' answers", async () => {
      await seed({ phase: "question", qIndex: 0, answers });
      await assertFails(player(P1).ref(`${G}/answers/0/${P2}`).get());
      await assertFails(player(P1).ref(`${G}/answers/0`).get());
      await assertFails(player(P1).ref(`${G}/answers`).get());
    });
  });
});

describe("RTDB: transition lock (state.lock)", () => {
  const lockAt = (at: number) => owner().ref(`${G}/state/lock`).set({ by: "reveal", at });
  it("answers are rejected while a fresh lock is held, accepted once it is stale", async () => {
    await seed({ phase: "question", qIndex: 0 });
    await lockAt(Date.now());
    await assertFails(player(P1).ref(`${G}/answers/0/${P1}`).set({ choice: 1, at: serverTimestamp() }));
    await lockAt(Date.now() - 31_000);
    await assertSucceeds(player(P1).ref(`${G}/answers/0/${P1}`).set({ choice: 1, at: serverTimestamp() }));
  });
  it("joins and leaves are rejected while a fresh lock is held", async () => {
    await seed();
    await lockAt(Date.now());
    await assertFails(player(OUTSIDER).ref(`${G}/players/${OUTSIDER}`).set({ name: "Ali", joinedAt: serverTimestamp() }));
    await assertFails(player(P1).ref(`${G}/players/${P1}`).remove());
    await lockAt(Date.now() - 31_000);
    await assertSucceeds(player(OUTSIDER).ref(`${G}/players/${OUTSIDER}`).set({ name: "Ali", joinedAt: serverTimestamp() }));
  });
  it("clients cannot write the lock", async () => {
    await seed({ phase: "question" });
    await assertFails(host().ref(`${G}/state/lock`).set({ by: "reveal", at: Date.now() }));
    await lockAt(Date.now());
    await assertFails(player(P1).ref(`${G}/state/lock`).remove());
  });
});

describe("RTDB: scores", () => {
  it("host reads all scores", async () => {
    await seed({ phase: "reveal" });
    await assertSucceeds(host().ref(`${G}/scores`).get());
  });
  it("player reads own score only", async () => {
    await seed({ phase: "reveal" });
    await assertSucceeds(player(P1).ref(`${G}/scores/${P1}`).get());
    await assertFails(player(P1).ref(`${G}/scores/${P2}`).get());
    await assertFails(player(P1).ref(`${G}/scores`).get());
  });
});
