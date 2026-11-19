import { describe, it, expect } from "vitest";
import { displayName, displayPlayers } from "./displayNames";
import { translate } from "../i18n";
import { club } from "../club.config";

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(club.locale, k, v);
const p = (uid: string, name: string) => ({ uid, name, joinedAt: 0 });

describe("displayName", () => {
  it("keeps allowed names", () => {
    expect(displayName("Ali", 1)).toEqual({ label: "Ali", masked: false });
  });
  it("replaces a blocked name with a neutral numbered label", () => {
    expect(displayName("amk", 4)).toEqual({ label: t("hostGame.maskedName", { n: 4 }), masked: true });
  });
});

describe("displayPlayers", () => {
  it("masks blocked names by position and never changes the uid or the data", () => {
    const players = [p("a", "Ali"), p("b", "amk")];
    const out = displayPlayers(players);
    expect(out.map((x) => x.label)).toEqual(["Ali", t("hostGame.maskedName", { n: 2 })]);
    expect(out[1]).toMatchObject({ uid: "b", masked: true });
    expect(players[1]!.name).toBe("amk");
  });

  it("marks case-insensitive duplicates (Turkish casing) but not unique names", () => {
    const out = displayPlayers([p("a", "Işık"), p("b", "ışık"), p("c", "Can"), p("d", "IŞIK ")]);
    expect(out.map((x) => x.duplicate)).toEqual([true, true, false, true]);
  });

  it("masked names are not reported as duplicates of each other", () => {
    const out = displayPlayers([p("a", "amk"), p("b", "AMK")]);
    expect(out.map((x) => x.duplicate)).toEqual([false, false]);
  });
});
