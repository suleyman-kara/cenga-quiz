import { describe, it, expect } from "vitest";
import { parseQuestionsText } from "./quizText";

/** Compact view of the parsed questions for assertions. */
const view = (text: string) => {
  const r = parseQuestionsText(text);
  return {
    questions: r.questions.map((q) => ({ text: q.text, options: q.options, correct: q.correct })),
    warnings: r.warnings,
  };
};

const SAMPLE = `1. Sohbet botu ile Agent arasındaki temel fark nedir?
A) Sohbet botu cevap yazar, agent işi yapıp sonucu getirir
B) Sohbet botu sesli çalışır, agent yalnızca metinle çalışır
C) Agent yalnızca sabit adımları takip eder
D) Aralarında işlevsel bir fark yoktur
Doğru Cevap: A
2. Bir işin adımları baştan belliyse hangisi daha ucuz, hızlı ve güvenilirdir?
A) Çoklu agent mimarisi
B) Sabit akış
C) Tam ekran görsel tarama
D) Sınırsız araç erişimi
Doğru Cevap: B
`;

describe("parseQuestionsText", () => {
  it("parses the standard numbered format with inline answers", () => {
    const r = view(SAMPLE);
    expect(r.warnings).toEqual([]);
    expect(r.questions).toEqual([
      {
        text: "Sohbet botu ile Agent arasındaki temel fark nedir?",
        options: [
          "Sohbet botu cevap yazar, agent işi yapıp sonucu getirir",
          "Sohbet botu sesli çalışır, agent yalnızca metinle çalışır",
          "Agent yalnızca sabit adımları takip eder",
          "Aralarında işlevsel bir fark yoktur",
        ],
        correct: 0,
      },
      {
        text: "Bir işin adımları baştan belliyse hangisi daha ucuz, hızlı ve güvenilirdir?",
        options: ["Çoklu agent mimarisi", "Sabit akış", "Tam ekran görsel tarama", "Sınırsız araç erişimi"],
        correct: 1,
      },
    ]);
  });

  it("returns editor-ready drafts (default time, no image)", () => {
    const q = parseQuestionsText(SAMPLE).questions[0];
    expect(q.seconds).toBe("");
    expect(q.imageUrl).toBe("");
  });

  it("handles CRLF, blank lines, extra spaces and curly quotes", () => {
    const text =
      "1)  “Bulut” ne demek?\r\n\r\n  a) Hava olayı\r\n\r\n  b) Uzak sunucular\r\n\r\nCevap: “b”\r\n\r\n" +
      "2) İkinci soru?\r\nA) Bir\r\nB) İki\r\nDoğru Cevap: ‘A’\r\n";
    const r = view(text);
    expect(r.warnings).toEqual([]);
    expect(r.questions).toEqual([
      { text: "“Bulut” ne demek?", options: ["Hava olayı", "Uzak sunucular"], correct: 1 },
      { text: "İkinci soru?", options: ["Bir", "İki"], correct: 0 },
    ]);
  });

  it("accepts answers written as letter + repeated option text, lower case and Turkish upper case", () => {
    const text = `1. Bilgisayar neyden oluşur?
A) Makine ve Yazılım
B) Yalnızca ekran
Doğru Cevap: A) Makine ve Yazılım
2. Hangisi renk?
A) Masa
B) Mavi
C) Kalem
Cevap: b
3. Hangisi meyve?
A) Elma
B) Taş
C) Demir
DOĞRU CEVAP: A`;
    const r = view(text);
    expect(r.warnings).toEqual([]);
    expect(r.questions.map((q) => q.correct)).toEqual([0, 1, 0]);
  });

  it("accepts option markers A. / a) / A - and question numbers 1. / 1)", () => {
    const text = `1) Birinci?
A. Bir
B. İki
C. Üç
Cevap: C
2. İkinci?
a) Kırmızı
b) Yeşil
Cevap: a
3) Üçüncü?
A - Kuzey
B - Güney
C - Doğu
D - Batı
Doğru Cevap: D`;
    const r = view(text);
    expect(r.warnings).toEqual([]);
    expect(r.questions).toEqual([
      { text: "Birinci?", options: ["Bir", "İki", "Üç"], correct: 2 },
      { text: "İkinci?", options: ["Kırmızı", "Yeşil"], correct: 0 },
      { text: "Üçüncü?", options: ["Kuzey", "Güney", "Doğu", "Batı"], correct: 3 },
    ]);
  });

  it("matches an answer given as the option text", () => {
    const r = view("1. Başkent neresi?\nA) İzmir\nB) Ankara\nCevap: ankara");
    expect(r.questions[0].correct).toBe(1);
    expect(r.warnings).toEqual([]);
  });

  it("warns when a question has no answer and defaults to the first option", () => {
    const text = `1. Bir?
A) x
B) y
Cevap: B
2. İki?
A) x
B) y
Cevap: A
3. Üç?
A) x
B) y`;
    const r = view(text);
    expect(r.questions).toHaveLength(3);
    expect(r.questions[2].correct).toBe(0);
    expect(r.warnings).toEqual(["3. soru: doğru cevap bulunamadı"]);
  });

  it("warns when the answer letter is not one of the options", () => {
    const r = view("1. Soru?\nA) x\nB) y\nCevap: D");
    expect(r.questions[0].correct).toBe(0);
    expect(r.warnings).toEqual(["1. soru: doğru cevap (D) şıklar arasında yok"]);
  });

  it("reads an answer key section with a heading", () => {
    const text = `1. İlk programlama dillerinden hangisi bilimsel hesap için yapıldı?
A) Python
B) Java
C) Fortran
D) Go

2. Hangisi bir işletim sistemi?
A) Excel
B) Linux
C) Chrome

CEVAP ANAHTARI
1. C) Fortran
2. B`;
    const r = view(text);
    expect(r.warnings).toEqual([]);
    expect(r.questions.map((q) => q.correct)).toEqual([2, 1]);
    expect(r.questions[1].options).toEqual(["Excel", "Linux", "Chrome"]);
  });

  it("reads answer-key lines after the questions even without a heading", () => {
    const text = `1. Bir?
A) x
B) y
C) z
2. İki?
A) x
B) y

1. C
2) b`;
    const r = view(text);
    expect(r.questions).toHaveLength(2);
    expect(r.questions.map((q) => q.correct)).toEqual([2, 1]);
    expect(r.warnings).toEqual([]);
  });

  it("a numbered question starting with a letter-like word is not mistaken for an answer key", () => {
    const text = `1. Bir?
A) x
B) y
Cevap: A
2. A vitamini hangisinde bol?
A) Havuç
B) Tuz
Cevap: A
3. E-posta hangi yılda yaygınlaştı?
A) 1990'lar
B) 1950'ler
Cevap: A`;
    const r = view(text);
    expect(r.questions.map((q) => q.text)).toEqual(["Bir?", "A vitamini hangisinde bol?", "E-posta hangi yılda yaygınlaştı?"]);
    expect(r.warnings).toEqual([]);
  });

  it("ignores title and heading lines before the first question", () => {
    const text = `Yapay Zekâ Temelleri — Quiz
Bölüm 1: Kavramlar

1. Soru?
A) x
B) y
Cevap: A`;
    const r = view(text);
    expect(r.questions).toEqual([{ text: "Soru?", options: ["x", "y"], correct: 0 }]);
    expect(r.warnings).toEqual([]);
  });

  it("joins a question text that wraps over several lines", () => {
    const r = view("1. Uzun bir soru\nikinci satırda devam ediyor?\nA) x\nB) y\nCevap: B");
    expect(r.questions[0].text).toBe("Uzun bir soru ikinci satırda devam ediyor?");
  });

  it("accepts a 'Soru 1:' prefix", () => {
    const r = view("Soru 1: Başkent?\nA) Ankara\nB) İzmir\nDoğru cevap: A");
    expect(r.questions).toEqual([{ text: "Başkent?", options: ["Ankara", "İzmir"], correct: 0 }]);
  });

  it("keeps at most 4 options and warns", () => {
    const r = view("1. Çok şıklı?\nA) a\nB) b\nC) c\nD) d\nE) e\nCevap: B");
    expect(r.questions[0].options).toEqual(["a", "b", "c", "d"]);
    expect(r.questions[0].correct).toBe(1);
    expect(r.warnings).toEqual(["1. soru: en fazla 4 şık olabilir, fazlası atıldı"]);
  });

  it("warns about a question with fewer than 2 options and pads it", () => {
    const r = view("1. Tek şıklı?\nA) a\nCevap: A");
    expect(r.questions[0].options).toEqual(["a", ""]);
    expect(r.warnings).toEqual(["1. soru: en az 2 şık gerekli"]);
  });

  it("empty or option-free text finds nothing", () => {
    expect(parseQuestionsText("")).toEqual({ questions: [], warnings: [] });
    expect(parseQuestionsText("  \n\n Sadece bir başlık \n")).toEqual({ questions: [], warnings: [] });
  });
});
