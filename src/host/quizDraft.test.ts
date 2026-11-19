import { describe, it, expect } from "vitest";
import { validateQuiz } from "../../shared/quizValidate";
import {
  addOption,
  addQuestion,
  describeErrors,
  draftFromQuiz,
  draftToInput,
  emptyDraft,
  moveQuestion,
  removeOption,
  removeQuestion,
  setCorrect,
  setOption,
  updateQuestion,
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
