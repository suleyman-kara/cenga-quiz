/**
 * quizzes/quiz.schema.json ile shared/quizValidate.ts birebir uyumlu mu?
 * Şema, quiz yazarlarına editörde otomatik tamamlama/uyarı verir; asıl doğrulama
 * validateQuiz'dir. İkisi ayrışırsa bu test kırmızıya döner.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { IMAGE_URL_MAX, QUIZ_LIMITS, validateQuiz } from "./quizValidate";

const ROOT = join(__dirname, "..");
const readJson = (rel: string) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

const schema = readJson("quizzes/quiz.schema.json");
const ajv = new Ajv2020({ allErrors: true, strict: true });
const schemaValid = ajv.compile(schema);

const L = QUIZ_LIMITS;
const question = schema.$defs.question;

function q(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { text: "Başkent neresi?", options: ["Ankara", "İstanbul"], correct: 0, ...over };
}
function quiz(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { title: "Genel Kültür", questions: [q()], ...over };
}
const str = (n: number) => "a".repeat(n);
const opts = (n: number) => Array.from({ length: n }, (_, i) => `Şık ${i + 1}`);

describe("quiz.schema.json — limitler QUIZ_LIMITS ile aynı", () => {
  it("quiz alanları", () => {
    expect(schema.properties.title.maxLength).toBe(L.titleMax);
    expect(schema.properties.description.maxLength).toBe(L.descriptionMax);
    expect(schema.properties.questions.minItems).toBe(L.questionsMin);
    expect(schema.properties.questions.maxItems).toBe(L.questionsMax);
    expect(schema.required).toEqual(["title", "questions"]);
  });

  it("soru alanları", () => {
    expect(question.properties.text.maxLength).toBe(L.textMax);
    expect(question.properties.options.minItems).toBe(L.optionsMin);
    expect(question.properties.options.maxItems).toBe(L.optionsMax);
    expect(question.properties.options.items.maxLength).toBe(L.optionMax);
    expect(question.properties.correct.minimum).toBe(0);
    expect(question.properties.correct.maximum).toBe(L.optionsMax - 1);
    expect(question.properties.seconds.minimum).toBe(L.secondsMin);
    expect(question.properties.seconds.maximum).toBe(L.secondsMax);
    expect(question.properties.imageUrl.maxLength).toBe(IMAGE_URL_MAX);
    expect(question.required).toEqual(["text", "options", "correct"]);
  });
});

describe("quiz.schema.json — örnek quizler", () => {
  it("quizzes/ornek.json şemayı referans eder", () => {
    expect(readJson("quizzes/ornek.json").$schema).toBe("./quiz.schema.json");
  });

  it("quizzes/ornek.json hem şemadan hem validateQuiz'den geçer", () => {
    const sample = readJson("quizzes/ornek.json");
    expect(schemaValid(sample), JSON.stringify(schemaValid.errors)).toBe(true);
    expect(validateQuiz(sample).ok).toBe(true);
  });
});

// Şema ile validateQuiz'in aynı kararı verdiği sınır durumları.
const cases: [string, unknown, boolean][] = [
  ["en küçük geçerli quiz", quiz(), true],
  ["açıklama + süre + görsel", quiz({ description: "x", questions: [q({ seconds: 20, imageUrl: "https://a.b/c.png" })] }), true],
  ["başlık sınırda", quiz({ title: str(L.titleMax) }), true],
  ["başlık uzun", quiz({ title: str(L.titleMax + 1) }), false],
  ["başlık boş", quiz({ title: "" }), false],
  ["başlık sadece boşluk", quiz({ title: "   " }), false],
  ["başlık yok", { questions: [q()] }, false],
  ["açıklama uzun", quiz({ description: str(L.descriptionMax + 1) }), false],
  ["soru yok", quiz({ questions: [] }), false],
  ["soru sayısı sınırda", quiz({ questions: Array.from({ length: L.questionsMax }, () => q()) }), true],
  ["soru sayısı fazla", quiz({ questions: Array.from({ length: L.questionsMax + 1 }, () => q()) }), false],
  ["soru metni uzun", quiz({ questions: [q({ text: str(L.textMax + 1) })] }), false],
  ["tek şık", quiz({ questions: [q({ options: opts(1) })] }), false],
  ["dört şık", quiz({ questions: [q({ options: opts(4), correct: 3 })] }), true],
  ["beş şık", quiz({ questions: [q({ options: opts(5) })] }), false],
  ["şık uzun", quiz({ questions: [q({ options: ["a", str(L.optionMax + 1)] })] }), false],
  ["şık boş", quiz({ questions: [q({ options: ["a", ""] })] }), false],
  ["aynı şıklar", quiz({ questions: [q({ options: ["a", "a"] })] }), false],
  ["correct negatif", quiz({ questions: [q({ correct: -1 })] }), false],
  ["correct ondalık", quiz({ questions: [q({ correct: 0.5 })] }), false],
  ["correct metin", quiz({ questions: [q({ correct: "0" })] }), false],
  ["süre alt sınır", quiz({ questions: [q({ seconds: L.secondsMin })] }), true],
  ["süre kısa", quiz({ questions: [q({ seconds: L.secondsMin - 1 })] }), false],
  ["süre uzun", quiz({ questions: [q({ seconds: L.secondsMax + 1 })] }), false],
  ["süre ondalık", quiz({ questions: [q({ seconds: 10.5 })] }), false],
  ["görsel http", quiz({ questions: [q({ imageUrl: "http://a.b/c.png" })] }), false],
  ["görsel adres değil", quiz({ questions: [q({ imageUrl: "resim.png" })] }), false],
];

describe("quiz.schema.json — validateQuiz ile aynı karar", () => {
  it.each(cases)("%s", (_name, input, expected) => {
    expect(validateQuiz(input).ok).toBe(expected);
    expect(schemaValid(input), JSON.stringify(schemaValid.errors)).toBe(expected);
  });
});
