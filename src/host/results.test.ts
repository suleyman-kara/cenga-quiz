import { describe, it, expect } from "vitest";
import type { GameResultDoc } from "../../shared/types";
import { questionsCsv, rankingCsv, resultFileName } from "./results";

const doc = (p: Partial<GameResultDoc> = {}): GameResultDoc => ({
  pin: "123456",
  hostUid: "h",
  quizId: "q",
  title: "Genel Kültür; Tur 1",
  createdAt: Date.UTC(2026, 10, 20, 17, 0),
  endedAt: Date.UTC(2026, 10, 20, 18, 0),
  playerCount: 3,
  questionCount: 2,
  expireAt: new Date(0),
  results: [
    { uid: "a", name: "Ayşe", score: 1850, rank: 1, correctCount: 2 },
    { uid: "b", name: 'Ali "Kral"', score: 900, rank: 2, correctCount: 1 },
    { uid: "c", name: "=1+1", score: 0, rank: 3, correctCount: 0 },
  ],
  questions: [
    { index: 0, text: "Başkent?", correct: 1, counts: [1, 2, 0], players: 3 },
    { index: 1, text: "Renk; hangisi?", correct: 0, counts: [0, 1], players: 3 },
  ],
  ...p,
});

describe("rankingCsv", () => {
  it("one row per player with a BOM and ';' separators (Excel opens Turkish text correctly)", () => {
    const csv = rankingCsv(doc());
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe("Sıra;Takma ad;Puan;Doğru sayısı");
    expect(lines[1]).toBe("1;Ayşe;1850;2");
    expect(lines).toHaveLength(4);
  });

  it("quotes fields with separators or quotes, and defuses spreadsheet formulas", () => {
    const lines = rankingCsv(doc()).slice(1).trimEnd().split("\r\n");
    expect(lines[2]).toBe('2;"Ali ""Kral""";900;1');
    expect(lines[3]).toBe("3;'=1+1;0;0");
  });
});

describe("questionsCsv", () => {
  it("per question: text, correct option, how many answered and got it right, and the rate", () => {
    const lines = questionsCsv(doc()).slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe("Soru;Metin;Doğru şık;Cevaplayan;Doğru cevaplayan;Doğru oranı (%)");
    expect(lines[1]).toBe("1;Başkent?;B;3;2;67");
    expect(lines[2]).toBe('2;"Renk; hangisi?";A;1;0;0');
  });

  it("an older result without question stats gives only the header", () => {
    const lines = questionsCsv(doc({ questions: undefined })).slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(1);
  });
});

describe("resultFileName", () => {
  it("title slug + date, ASCII only", () => {
    expect(resultFileName(doc(), "siralama")).toBe("genel-kultur-tur-1-2026-11-20-siralama.csv");
  });
});
