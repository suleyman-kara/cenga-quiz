/** Dispatcher ordering: unauthorized callers are rejected before (or with minimal) I/O. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const io = vi.hoisted(() => ({
  allowed: new Set<string>(),
  docReads: [] as string[],
  dbCalls: 0,
}));

vi.mock("./firebase", () => ({
  database: vi.fn(async () => {
    io.dbCalls++;
    throw new Error("database must not be touched");
  }),
  firestore: vi.fn(async () => ({
    doc: (path: string) => ({
      get: async () => {
        io.docReads.push(path);
        return { exists: io.allowed.has(path), data: () => ({}) };
      },
    }),
  })),
}));

const { dispatchHost } = await import("./callables");
const { hostCheck } = await import("./hostAuth");

const user = (email: string, verified = true) => ({ uid: "u1", token: { email, email_verified: verified } });

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "resolved";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe("dispatchHost authorization order", () => {
  beforeEach(() => {
    io.allowed.clear();
    io.docReads.length = 0;
    io.dbCalls = 0;
    hostCheck.clear();
  });

  it("rejects unauthenticated and unverified callers before any I/O", async () => {
    for (const action of ["startGame", "reveal", "kickPlayer", "kickPlayers", "setLobbyLocked", "createGame", "endGame"]) {
      const data = { action, pin: "123456", qIndex: 0, uid: "x", uids: ["x"], locked: true, quizId: "q" };
      expect(await code(dispatchHost(undefined, data))).toBe("unauthenticated");
      expect(await code(dispatchHost(user("a@x.com", false), data))).toBe("permission-denied");
      expect(await code(dispatchHost({ uid: "u1", token: {} }, data))).toBe("permission-denied");
    }
    expect(io.docReads).toEqual([]);
    expect(io.dbCalls).toBe(0);
  });

  it("checks allowedHosts before loading the room or the private quiz", async () => {
    for (const action of ["startGame", "reveal", "kickPlayer", "kickPlayers", "setLobbyLocked", "endGame"]) {
      const data = { action, pin: "123456", qIndex: 0, uid: "x", uids: ["x"], locked: true };
      expect(await code(dispatchHost(user("stranger@x.com"), data))).toBe("permission-denied");
    }
    // one allowedHosts read (then cached), never liveGames/*, never RTDB
    expect(io.docReads).toEqual(["allowedHosts/stranger@x.com"]);
    expect(io.dbCalls).toBe(0);
  });
});
