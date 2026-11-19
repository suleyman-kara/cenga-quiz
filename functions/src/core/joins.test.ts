import { describe, it, expect } from "vitest";
import { joinRename, metaAfterJoin, metaAfterLeave } from "./joins";
import { lobbyRoom } from "./fixtures";
import type { GameMeta, PlayerEntry } from "../../../shared/types";

const meta = (): GameMeta => lobbyRoom().meta!;
const players = (entries: [string, string, number][]): Record<string, PlayerEntry> =>
  Object.fromEntries(entries.map(([uid, name, joinedAt]) => [uid, { name, joinedAt }]));

describe("joinRename", () => {
  it("returns undefined for a clean, unique name", () => {
    expect(joinRename(players([["a", "Ali", 1], ["b", "Banu", 2]]), "b", "Oyuncu")).toBeUndefined();
  });
  it("replaces a blocked name with '<prefix> N'", () => {
    expect(joinRename(players([["a", "Ali", 1], ["b", "s1kt1r", 2]]), "b", "Oyuncu")).toBe("Oyuncu 1");
  });
  it("skips generated names that are already taken", () => {
    const p = players([["a", "Oyuncu 1", 1], ["b", "orospu", 2]]);
    expect(joinRename(p, "b", "Oyuncu")).toBe("Oyuncu 2");
  });
  it("suffixes a case-insensitive duplicate of an earlier joiner (Turkish İ/I aware)", () => {
    expect(joinRename(players([["a", "ALİ", 1], ["b", "ali", 2]]), "b", "Oyuncu")).toBe("ali (2)");
    expect(joinRename(players([["a", "Ali", 1], ["b", "ali (2)", 2], ["c", "ALI", 3]]), "c", "Oyuncu")).toBeUndefined();
    expect(joinRename(players([["a", "Ali", 1], ["b", "ali (2)", 2], ["c", "ALİ", 3]]), "c", "Oyuncu")).toBe("ALİ (3)");
  });
  it("never renames the earlier joiner; ignores missing / partial entries", () => {
    expect(joinRename(players([["a", "Ali", 1], ["b", "ali", 2]]), "a", "Oyuncu")).toBeUndefined();
    expect(joinRename(players([["a", "Ali", 1]]), "zz", "Oyuncu")).toBeUndefined();
    const partial = { a: { name: "Ali" } } as unknown as Record<string, PlayerEntry>;
    expect(joinRename(partial, "a", "Oyuncu")).toBeUndefined();
  });
});

describe("metaAfterJoin / metaAfterLeave", () => {
  it("counts joins, marks the lobby full at maxPlayers and tracks the last join time", () => {
    let m: GameMeta = meta();
    m = metaAfterJoin(m, { maxPlayers: 2, joinedAt: 5000 });
    expect(m).toMatchObject({ playerCount: 1, full: false, lastActivityAt: 5000 });
    m = metaAfterJoin(m, { maxPlayers: 2, joinedAt: 4000 }); // out-of-order delivery keeps the max
    expect(m).toMatchObject({ playerCount: 2, full: true, lastActivityAt: 5000 });
    expect(m.hostUid).toBe("host");
  });
  it("leaves decrement (never below 0) and clear full", () => {
    let m: GameMeta = { ...meta(), playerCount: 2, full: true };
    m = metaAfterLeave(m, { maxPlayers: 2 });
    expect(m).toMatchObject({ playerCount: 1, full: false });
    m = metaAfterLeave(metaAfterLeave(m, { maxPlayers: 2 }), { maxPlayers: 2 });
    expect(m.playerCount).toBe(0);
  });
});
