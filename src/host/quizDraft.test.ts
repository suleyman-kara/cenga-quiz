import { describe, it, expect } from "vitest";
import { validateQuiz } from "../../shared/quizValidate";
import {
  addOption,
  addQuestion,
  appendQuestions,
  describeErrors,
  duplicateQuestion,
  emptyQuestion,
  isPreviewableImage,
  reorderQuestion,
  draftFromQuiz,
  draftToInput,
  emptyDraft,
  moveQuestion,
  removeOption,
  removeQuestion,
  setCorrect,
  setOption,
  updateQuestion,
  type QuestionDraft,
  type QuizDraft,
} from "./quizDraft";

const quiz = {
  title: "Genel Kültür",
  description: "Isınma",
  questions: [
    { text: "Başkent?", options: ["İzmir", "Ankara"], correct: 1, seconds: 15 },
    { text: "Su?", options: ["H2O", "CO2", "O2"], correct: 0, imageUrl: "https://a.b/c.png" },
  ],
};

describe("quiz draft", () => {
  it("an empty draft has one question with two empty options", () => {
    const d = emptyDraft();
    expect(d.title).toBe("");
    expect(d.questions).toHaveLength(1);
    expect(d.questions[0].options).toEqual(["", ""]);
    expect(d.questions[0].correct).toBe(0);
  });

  it("round-trips a quiz through the draft", () => {
    const back = validateQuiz(draftToInput(draftFromQuiz(quiz)));
    expect(back).toEqual({ ok: true, quiz });
  });

  it("blank seconds / image are left out; seconds text becomes a number", () => {
    let d = draftFromQuiz(quiz);
    d = updateQuestion(d, 0, { seconds: "", imageUrl: "  " });
    d = updateQuestion(d, 1, { seconds: "30" });
    const input = draftToInput(d) as { questions: Record<string, unknown>[] };
    expect(input.questions[0]).not.toHaveProperty("seconds");
    expect(input.questions[0]).not.toHaveProperty("imageUrl");
    expect(input.questions[1].seconds).toBe(30);
  });

  it("adds, removes and moves questions (never fewer than one)", () => {
    let d: QuizDraft = draftFromQuiz(quiz);
    d = addQuestion(d);
    expect(d.questions).toHaveLength(3);
    d = moveQuestion(d, 2, -1);
    expect(d.questions[1].text).toBe("");
    expect(d.questions[2].text).toBe("Su?");
    d = moveQuestion(d, 0, -1); // already first: no-op
    expect(d.questions[0].text).toBe("Başkent?");
    d = removeQuestion(removeQuestion(removeQuestion(d, 0), 0), 0);
    expect(d.questions).toHaveLength(1);
  });

  it("options: 2 to 4, and the correct index follows removals", () => {
    let d = draftFromQuiz(quiz); // q1: H2O CO2 O2, correct 0
    d = setCorrect(d, 1, 2);
    d = addOption(d, 1);
    d = addOption(d, 1); // already 4 → no-op
    expect(d.questions[1].options).toHaveLength(4);
    d = setOption(d, 1, 3, "N2");
    d = removeOption(d, 1, 0); // removing before the correct one shifts it
    expect(d.questions[1].options).toEqual(["CO2", "O2", "N2"]);
    expect(d.questions[1].correct).toBe(1);
    d = removeOption(d, 1, 1); // removing the correct one resets to 0
    expect(d.questions[1].correct).toBe(0);
    d = removeOption(d, 1, 0); // only 2 left → no-op
    expect(d.questions[1].options).toHaveLength(2);
  });

  it("is immutable", () => {
    const d = draftFromQuiz(quiz);
    const before = JSON.stringify(d);
    addQuestion(d);
    setOption(d, 0, 0, "x");
    removeQuestion(d, 0);
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe("describeErrors", () => {
  it("groups validation errors per question with Turkish field names", () => {
    const r = validateQuiz(
      draftToInput({
        title: "",
        description: "",
        questions: [
          { text: "ok", options: ["a", "b"], correct: 0, seconds: "", imageUrl: "" },
          { text: "", options: ["a", ""], correct: 0, seconds: "3", imageUrl: "http://x" },
        ],
      }),
    );
    if (r.ok) throw new Error("expected errors");
    const d = describeErrors(r.errors);
    expect(d.general).toEqual(["Başlık: boş olamaz"]);
    expect(d.byQuestion[0]).toBeUndefined();
    expect(d.byQuestion[1]).toEqual([
      "Soru metni: boş olamaz",
      "2. şık: boş olamaz",
      "Süre: 5 ile 120 arasında tam sayı olmalı",
      "Görsel adresi: https:// ile başlayan geçerli bir adres olmalı",
    ]);
  });

  it("question-level messages without a field keep a readable label", () => {
    const d = describeErrors(["questions[2].options: şıklar birbirinden farklı olmalı", "questions: 1 ile 100 arasında soru olmalı"]);
    expect(d.byQuestion[2]).toEqual(["Şıklar: şıklar birbirinden farklı olmalı"]);
    expect(d.general).toEqual(["Sorular: 1 ile 100 arasında soru olmalı"]);
  });
});

describe("editor extras", () => {
  const q = (text: string): QuestionDraft => ({ ...emptyQuestion(), text, options: ["a", "b"] });

  it("every question gets a unique id (not part of the saved quiz)", () => {
    const d = draftFromQuiz(quiz);
    const ids = [...d.questions, ...emptyDraft().questions].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    const input = draftToInput(d) as { questions: Record<string, unknown>[] };
    expect(input.questions[0]).not.toHaveProperty("id");
  });

  it("duplicates a question right after itself with a new id", () => {
    const d = draftFromQuiz(quiz);
    const out = duplicateQuestion(d, 0);
    expect(out.questions.map((x) => x.text)).toEqual(["Başkent?", "Başkent?", "Su?"]);
    expect(out.questions[1].options).toEqual(out.questions[0].options);
    expect(out.questions[1].options).not.toBe(out.questions[0].options);
    expect(out.questions[1].id).not.toBe(out.questions[0].id);
    expect(d.questions).toHaveLength(2);
  });

  it("does not duplicate past the question limit", () => {
    const d: QuizDraft = { title: "", description: "", questions: Array.from({ length: 100 }, () => q("x")) };
    expect(duplicateQuestion(d, 0)).toBe(d);
  });

  it("appends questions, replacing a single completely empty question", () => {
    const fresh = appendQuestions(emptyDraft(), [q("A"), q("B")]);
    expect(fresh.questions.map((x) => x.text)).toEqual(["A", "B"]);
    expect(new Set(fresh.questions.map((x) => x.id)).size).toBe(2);

    const started = updateQuestion(emptyDraft(), 0, { seconds: "20" });
    expect(appendQuestions(started, [q("A")]).questions).toHaveLength(2);

    const existing = appendQuestions(draftFromQuiz(quiz), [q("C")]);
    expect(existing.questions.map((x) => x.text)).toEqual(["Başkent?", "Su?", "C"]);
  });

  it("appending stops at the question limit", () => {
    const many = Array.from({ length: 120 }, (_, i) => q(`S${i}`));
    const out = appendQuestions(draftFromQuiz(quiz), many);
    expect(out.questions).toHaveLength(100);
    expect(out.questions[99].text).toBe("S97");
  });

  it("reorders by moving one question to another position (drag and drop)", () => {
    const d = appendQuestions(emptyDraft(), [q("A"), q("B"), q("C")]);
    expect(reorderQuestion(d, 0, 2).questions.map((x) => x.text)).toEqual(["B", "C", "A"]);
    expect(reorderQuestion(d, 2, 0).questions.map((x) => x.text)).toEqual(["C", "A", "B"]);
    expect(reorderQuestion(d, 1, 1)).toBe(d);
    expect(reorderQuestion(d, 0, 5)).toBe(d);
  });

  it("only valid https image addresses are previewed", () => {
    expect(isPreviewableImage("https://a.b/c.png")).toBe(true);
    expect(isPreviewableImage("  https://a.b/c.png ")).toBe(true);
    expect(isPreviewableImage("http://a.b/c.png")).toBe(false);
    expect(isPreviewableImage("https://")).toBe(false);
    expect(isPreviewableImage("https://a b")).toBe(false);
    expect(isPreviewableImage("")).toBe(false);
  });
});
