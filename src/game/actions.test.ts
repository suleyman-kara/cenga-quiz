import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "firebase/database";
import { checkGame, fetchOwnAnswer } from "./actions";

vi.mock("../firebase", () => ({
  auth: { authStateReady: () => Promise.resolve(), currentUser: { uid: "u1" } },
  db: {},
}));
vi.mock("firebase/auth", () => ({ signInAnonymously: vi.fn() }));
vi.mock("firebase/database", () => ({
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  get: vi.fn(),
  set: vi.fn(),
  serverTimestamp: () => ({ ".sv": "timestamp" }),
}));

type Tree = Record<string, unknown>;
function room(tree: Tree) {
  vi.mocked(get).mockImplementation(async (r) => {
    const v = tree[(r as unknown as { path?: string } | undefined)?.path ?? ""];
    return { exists: () => v !== undefined && v !== null, val: () => v ?? null } as never;
  });
}

const P = "games/123456";

describe("checkGame", () => {
  beforeEach(() => vi.mocked(get).mockReset());

  it("notFound without meta", async () => {
    room({});
    expect(await checkGame("123456")).toEqual({ kind: "notFound" });
  });

  it("ok in an open lobby", async () => {
    room({ [`${P}/meta`]: { title: "x" }, [`${P}/state`]: { phase: "lobby" } });
    expect(await checkGame("123456")).toEqual({ kind: "ok" });
  });

  it("locked lobby", async () => {
    room({ [`${P}/meta`]: { locked: true }, [`${P}/state`]: { phase: "lobby" } });
    expect(await checkGame("123456")).toEqual({ kind: "locked" });
  });

  it("full lobby (meta.full)", async () => {
    room({ [`${P}/meta`]: { full: true, playerCount: 300 }, [`${P}/state`]: { phase: "lobby" } });
    expect(await checkGame("123456")).toEqual({ kind: "full" });
  });

  it("a player already in a full lobby still rejoins", async () => {
    room({ [`${P}/meta`]: { full: true }, [`${P}/state`]: { phase: "lobby" }, [`${P}/players/u1`]: { name: "Ali", joinedAt: 1 } });
    expect(await checkGame("123456")).toEqual({ kind: "rejoin", name: "Ali" });
  });

  it("banned player", async () => {
    room({ [`${P}/meta`]: {}, [`${P}/state`]: { phase: "lobby" }, [`${P}/banned/u1`]: true });
    expect(await checkGame("123456")).toEqual({ kind: "banned" });
  });

  it("already joined (mid-game or lobby): rejoin with the server's current name", async () => {
    room({
      [`${P}/meta`]: { locked: true },
      [`${P}/state`]: { phase: "question" },
      [`${P}/players/u1`]: { name: "Ali (2)", joinedAt: 1 },
    });
    expect(await checkGame("123456")).toEqual({ kind: "rejoin", name: "Ali (2)" });
  });

  it("started game without own player entry", async () => {
    room({ [`${P}/meta`]: {}, [`${P}/state`]: { phase: "reveal" } });
    expect(await checkGame("123456")).toEqual({ kind: "started" });
  });

  it("ended game is notFound even for former players", async () => {
    room({ [`${P}/meta`]: {}, [`${P}/state`]: { phase: "ended" }, [`${P}/players/u1`]: { name: "A" } });
    expect(await checkGame("123456")).toEqual({ kind: "notFound" });
  });
});

describe("fetchOwnAnswer", () => {
  beforeEach(() => vi.mocked(get).mockReset());

  it("returns the server's recorded choice for the player's own answer", async () => {
    room({ [`${P}/answers/2/u1`]: { choice: 3, at: 1 } });
    expect(await fetchOwnAnswer("123456", 2)).toBe(3);
  });

  it("null when the server has no answer", async () => {
    room({});
    expect(await fetchOwnAnswer("123456", 2)).toBeNull();
  });
});
