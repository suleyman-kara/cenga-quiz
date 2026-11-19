import { describe, it, expect } from "vitest";
import { translate } from "./index";
import { tr } from "./tr";
import { en } from "./en";

describe("i18n", () => {
  it("tr and en define the same keys", () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
  });

  it("interpolates {vars}", () => {
    expect(translate("en", "player.rank", { rank: 3 })).toContain("3");
    expect(translate("tr", "hostGame.answered", { answered: 2, total: 5 })).toMatch(/2.*5/);
  });

  it("falls back to en when a tr string is empty", () => {
    expect(translate("tr", "join.join")).toBe(tr["join.join"] || en["join.join"]);
  });
});
