import { describe, it, expect } from "vitest";
import { isNameAllowed, normalizeForMatch } from "./profanity";

describe("normalizeForMatch", () => {
  it("lowercases with Turkish dotted/dotless i and folds Turkish letters", () => {
    expect(normalizeForMatch("İBNE").compact).toBe("ibne");
    expect(normalizeForMatch("IŞIK").compact).toBe("isik");
    expect(normalizeForMatch("Çağrı Öztürk").tokens).toEqual(["cagri", "ozturk"]);
  });
  it("maps leetspeak and strips punctuation and spaces", () => {
    expect(normalizeForMatch("5!k7!r").compact).toBe("sktr"); // ! is punctuation, not leet
    expect(normalizeForMatch("$1kt1r").compact).toBe("siktir");
    expect(normalizeForMatch("@0 3 4 5 7").compact).toBe("aoeast");
    expect(normalizeForMatch("a.m.k").compact).toBe("amk");
  });
});

describe("isNameAllowed", () => {
  it.each(["Ali", "Ayşe Yılmaz", "Çağrı", "Işık", "Hasan", "Picasso", "Scunthorpe", "Sıkı Takım", "Kayarak", "Yoshitaka", "Oyuncu 7", "Amina"])(
    "allows %s",
    (name) => {
      expect(isNameAllowed(name)).toBe(true);
    },
  );
  it.each([
    ["plain", "orospu"],
    ["uppercase Turkish", "OROSPU ÇOCUĞU"],
    ["dotted capital I", "İBNE"],
    ["leetspeak", "s1kt1r"],
    ["dollar/at leet", "$ikt1r git"],
    ["spaced out", "o r o s p u"],
    ["punctuated", "s.i.k.t.i.r"],
    ["inside a longer name", "Ali_siktir_"],
    ["short word as a token", "amk"],
    ["short word dotted", "a.m.k"],
    ["english", "Fuck"],
    ["english leet", "b1tch"],
    ["english token", "dick"],
  ])("blocks %s (%s)", (_label, name) => {
    expect(isNameAllowed(name)).toBe(false);
  });
});
