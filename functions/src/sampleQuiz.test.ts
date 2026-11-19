import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateQuiz } from "../../shared/quizValidate";

const raw: unknown = JSON.parse(readFileSync(join(__dirname, "../../quizzes/ornek.json"), "utf8"));

describe("quizzes/ornek.json", () => {
  it("is a valid quiz", () => {
    const r = validateQuiz(raw);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("has 8 questions mixing 2, 3 and 4 options", () => {
    const r = validateQuiz(raw);
    if (!r.ok) throw new Error("invalid");
    expect(r.quiz.questions).toHaveLength(8);
    const sizes = new Set(r.quiz.questions.map((q) => q.options.length));
    expect([...sizes].sort()).toEqual([2, 3, 4]);
  });
});
