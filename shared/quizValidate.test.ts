import { describe, it, expect } from "vitest";
import type { QuizQuestion } from "./types";
import { QUIZ_LIMITS, validateQuiz, questionSeconds } from "./quizValidate";

function q(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { text: "Başkent neresi?", options: ["Ankara", "İstanbul"], correct: 0, ...over };
}
function quiz(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { title: "Genel Kültür", questions: [q()], ...over };
}
function errorsOf(input: unknown): string[] {
  const r = validateQuiz(input);
  if (r.ok) throw new Error("expected validation to fail");
  return r.errors;
}
function okQuiz(input: unknown) {
  const r = validateQuiz(input);
  if (!r.ok) throw new Error("expected ok, got: " + r.errors.join(" | "));
  return r.quiz;
}

describe("QUIZ_LIMITS", () => {
  it("has the agreed values", () => {
    expect(QUIZ_LIMITS).toEqual({
      titleMax: 120,
      descriptionMax: 500,
      questionsMin: 1,
      questionsMax: 100,
      textMax: 300,
      optionsMin: 2,
      optionsMax: 4,
      optionMax: 120,
      secondsMin: 5,
      secondsMax: 120,
    });
  });
});

describe("validateQuiz — valid input", () => {
  it("accepts a minimal quiz", () => {
    expect(okQuiz(quiz())).toEqual({
      title: "Genel Kültür",
      questions: [{ text: "Başkent neresi?", options: ["Ankara", "İstanbul"], correct: 0 }],
    });
  });

  it("accepts a full quiz with all optional fields", () => {
    const res = okQuiz(
      quiz({
        description: "Açıklama",
        questions: [
          q({ options: ["a", "b", "c", "d"], correct: 3, seconds: 30, imageUrl: "https://example.org/x.png" }),
        ],
      }),
    );
    expect(res.description).toBe("Açıklama");
    expect(res.questions[0]).toEqual({
      text: "Başkent neresi?",
      options: ["a", "b", "c", "d"],
      correct: 3,
      seconds: 30,
      imageUrl: "https://example.org/x.png",
    });
  });

  it("trims all strings", () => {
    const res = okQuiz({
      title: "  Başlık  ",
      description: "  açıklama ",
      questions: [{ text: " Soru? ", options: [" a ", "b  "], correct: 1, imageUrl: " https://x.org/a.png " }],
    });
    expect(res.title).toBe("Başlık");
    expect(res.description).toBe("açıklama");
    expect(res.questions[0].text).toBe("Soru?");
    expect(res.questions[0].options).toEqual(["a", "b"]);
    expect(res.questions[0].imageUrl).toBe("https://x.org/a.png");
  });

  it("strips unknown keys at every level", () => {
    const res = okQuiz({
      ...quiz(),
      ownerUid: "evil",
      extra: 1,
      questions: [{ ...q(), hack: true, __proto__x: 1 }],
    });
    expect(Object.keys(res).sort()).toEqual(["questions", "title"]);
    expect(Object.keys(res.questions[0]).sort()).toEqual(["correct", "options", "text"]);
  });

  it("drops empty/whitespace description and imageUrl, and null/undefined optional fields", () => {
    const res = okQuiz(
      quiz({ description: "   ", questions: [q({ imageUrl: "  ", seconds: null }), q({ seconds: undefined, imageUrl: null })] }),
    );
    expect("description" in res).toBe(false);
    expect("imageUrl" in res.questions[0]).toBe(false);
    expect("seconds" in res.questions[0]).toBe(false);
    expect("seconds" in res.questions[1]).toBe(false);
    expect("imageUrl" in res.questions[1]).toBe(false);
  });

  it("accepts boundary values", () => {
    const res = okQuiz({
      title: "t".repeat(120),
      description: "d".repeat(500),
      questions: Array.from({ length: 100 }, (_, i) =>
        q({ text: "x".repeat(300), options: ["o".repeat(120), "p"], seconds: i % 2 ? 5 : 120 }),
      ),
    });
    expect(res.questions).toHaveLength(100);
  });

  it("does not mutate the input", () => {
    const input = quiz({ title: "  T  " });
    const copy = JSON.parse(JSON.stringify(input));
    okQuiz(input);
    expect(input).toEqual(copy);
  });
});

describe("validateQuiz — invalid input", () => {
  it.each([null, undefined, 42, "quiz", [], true])("rejects non-object root %j", (v) => {
    const errs = errorsOf(v);
    expect(errs.length).toBeGreaterThan(0);
  });

  it("title missing / empty / not string / too long", () => {
    expect(errorsOf(quiz({ title: undefined })).some((e) => e.startsWith("title: "))).toBe(true);
    expect(errorsOf(quiz({ title: "   " })).some((e) => e.startsWith("title: "))).toBe(true);
    expect(errorsOf(quiz({ title: 5 })).some((e) => e.startsWith("title: "))).toBe(true);
    expect(errorsOf(quiz({ title: "t".repeat(121) })).some((e) => e.startsWith("title: "))).toBe(true);
  });

  it("title length is checked after trimming", () => {
    okQuiz(quiz({ title: "  " + "t".repeat(120) + "  " }));
  });

  it("description not string / too long", () => {
    expect(errorsOf(quiz({ description: 3 })).some((e) => e.startsWith("description: "))).toBe(true);
    expect(errorsOf(quiz({ description: "d".repeat(501) })).some((e) => e.startsWith("description: "))).toBe(true);
  });

  it("questions missing / not array / empty / too many", () => {
    expect(errorsOf(quiz({ questions: undefined })).some((e) => e.startsWith("questions: "))).toBe(true);
    expect(errorsOf(quiz({ questions: {} })).some((e) => e.startsWith("questions: "))).toBe(true);
    expect(errorsOf(quiz({ questions: [] })).some((e) => e.startsWith("questions: "))).toBe(true);
    expect(
      errorsOf(quiz({ questions: Array.from({ length: 101 }, () => q()) })).some((e) => e.startsWith("questions: ")),
    ).toBe(true);
  });

  it("question not an object", () => {
    expect(errorsOf(quiz({ questions: [q(), "x"] })).some((e) => e.startsWith("questions[1]: "))).toBe(true);
  });

  it("question text missing / empty / too long", () => {
    expect(errorsOf(quiz({ questions: [q({ text: undefined })] })).some((e) => e.startsWith("questions[0].text: "))).toBe(true);
    expect(errorsOf(quiz({ questions: [q({ text: "  " })] })).some((e) => e.startsWith("questions[0].text: "))).toBe(true);
    expect(errorsOf(quiz({ questions: [q({ text: "x".repeat(301) })] })).some((e) => e.startsWith("questions[0].text: "))).toBe(true);
  });

  it("options not array / too few / too many", () => {
    const has = (over: Record<string, unknown>) =>
      errorsOf(quiz({ questions: [q(over)] })).some((e) => e.startsWith("questions[0].options: "));
    expect(has({ options: "a,b" })).toBe(true);
    expect(has({ options: ["only"] })).toBe(true);
    expect(has({ options: ["a", "b", "c", "d", "e"], correct: 0 })).toBe(true);
  });

  it("individual option empty / not string / too long", () => {
    const errs = errorsOf(quiz({ questions: [q({ options: ["a", "  ", 7, "o".repeat(121)] })] }));
    expect(errs.some((e) => e.startsWith("questions[0].options[1]: "))).toBe(true);
    expect(errs.some((e) => e.startsWith("questions[0].options[2]: "))).toBe(true);
    expect(errs.some((e) => e.startsWith("questions[0].options[3]: "))).toBe(true);
    expect(errs.some((e) => e.startsWith("questions[0].options[0]"))).toBe(false);
  });

  it("duplicate options (after trim, case-insensitive) are rejected", () => {
    const errs = errorsOf(quiz({ questions: [q({ options: ["Evet", " evet "] })] }));
    expect(errs.some((e) => e.startsWith("questions[0].options"))).toBe(true);
  });

  it.each([
    ["out of range", 2],
    ["negative", -1],
    ["non-integer", 0.5],
    ["string", "0"],
    ["missing", undefined],
    ["NaN", NaN],
  ])("correct invalid (%s)", (_l, correct) => {
    const errs = errorsOf(quiz({ questions: [q(), q({ correct })] }));
    expect(errs).toContain("questions[1].correct: geçerli bir şık indeksi olmalı");
  });

  it.each([
    ["too small", 4],
    ["too big", 121],
    ["non-integer", 10.5],
    ["string", "20"],
    ["NaN", NaN],
    ["Infinity", Infinity],
  ])("seconds invalid (%s)", (_l, seconds) => {
    expect(errorsOf(quiz({ questions: [q({ seconds })] })).some((e) => e.startsWith("questions[0].seconds: "))).toBe(true);
  });

  it.each([
    "http://example.org/a.png",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "ftp://x.org/a.png",
    "not a url",
    "https://",
    "//example.org/a.png",
  ])("imageUrl must be https (%j)", (imageUrl) => {
    expect(errorsOf(quiz({ questions: [q({ imageUrl })] })).some((e) => e.startsWith("questions[0].imageUrl: "))).toBe(
      true,
    );
  });

  it("imageUrl not a string", () => {
    expect(errorsOf(quiz({ questions: [q({ imageUrl: 5 })] })).some((e) => e.startsWith("questions[0].imageUrl: "))).toBe(
      true,
    );
  });

  it("collects multiple errors across questions with correct paths", () => {
    const errs = errorsOf({
      title: "",
      questions: [q(), q({ text: "" }), q({ correct: 9, seconds: 1 })],
    });
    expect(errs.some((e) => e.startsWith("title: "))).toBe(true);
    expect(errs.some((e) => e.startsWith("questions[1].text: "))).toBe(true);
    expect(errs.some((e) => e.startsWith("questions[2].correct: "))).toBe(true);
    expect(errs.some((e) => e.startsWith("questions[2].seconds: "))).toBe(true);
    expect(errs.some((e) => e.startsWith("questions[0]"))).toBe(false);
  });

  it("error messages are Turkish and human readable", () => {
    const errs = errorsOf(quiz({ title: "" }));
    expect(errs[0]).toMatch(/^title: .*(boş|olmalı|gerekli)/);
  });
});

describe("questionSeconds", () => {
  const base: QuizQuestion = { text: "x", options: ["a", "b"], correct: 0 };

  it("uses the question's seconds when set", () => {
    expect(questionSeconds({ ...base, seconds: 30 }, 20)).toBe(30);
  });

  it("falls back to the default when unset", () => {
    expect(questionSeconds(base, 20)).toBe(20);
  });

  it("clamps out-of-range values to limits", () => {
    expect(questionSeconds({ ...base, seconds: 1 }, 20)).toBe(5);
    expect(questionSeconds({ ...base, seconds: 999 }, 20)).toBe(120);
  });

  it("falls back to default on non-finite values", () => {
    expect(questionSeconds({ ...base, seconds: NaN }, 20)).toBe(20);
  });

  it("clamps the default too", () => {
    expect(questionSeconds(base, 0)).toBe(5);
    expect(questionSeconds(base, 500)).toBe(120);
  });
});
