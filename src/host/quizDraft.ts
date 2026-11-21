/**
 * Quiz editor state. Pure and immutable: every operation returns a new draft.
 * Inputs are kept as strings while editing; draftToInput() turns the draft into the shape
 * validateQuiz() expects (validateQuiz stays the single source of truth for the rules).
 */
import { QUIZ_LIMITS } from "../../shared/quizValidate";
import type { Quiz } from "../../shared/types";

export interface QuestionDraft {
  text: string;
  options: string[];
  correct: number;
  /** "" = use the club's default duration */
  seconds: string;
  imageUrl: string;
  /** Editor-only stable identity (React keys, collapse state, drag and drop); never saved. */
  id?: number;
}

export interface QuizDraft {
  title: string;
  description: string;
  questions: QuestionDraft[];
}

let lastId = 0;
/** A new editor-only question id, unique within this page load. */
export const nextQuestionId = () => ++lastId;

export function emptyQuestion(): QuestionDraft {
  return { text: "", options: ["", ""], correct: 0, seconds: "", imageUrl: "", id: nextQuestionId() };
}

/** Nothing typed yet: no text, no option text, no time, no image and the default correct option. */
export function isEmptyQuestion(q: QuestionDraft): boolean {
  return (
    !q.text.trim() &&
    q.options.every((o) => !o.trim()) &&
    q.correct === 0 &&
    !q.seconds.trim() &&
    !q.imageUrl.trim()
  );
}

export function emptyDraft(): QuizDraft {
  return { title: "", description: "", questions: [emptyQuestion()] };
}

export function draftFromQuiz(quiz: Quiz): QuizDraft {
  return {
    title: quiz.title,
    description: quiz.description ?? "",
    questions: quiz.questions.map((q) => ({
      text: q.text,
      options: [...q.options],
      correct: q.correct,
      seconds: q.seconds === undefined ? "" : String(q.seconds),
      imageUrl: q.imageUrl ?? "",
      id: nextQuestionId(),
    })),
  };
}

/** Untrusted-shaped input for validateQuiz(); blank optionals are left out. */
export function draftToInput(d: QuizDraft): unknown {
  return {
    title: d.title,
    ...(d.description.trim() ? { description: d.description } : {}),
    questions: d.questions.map((q) => {
      const out: Record<string, unknown> = { text: q.text, options: q.options, correct: q.correct };
      const s = q.seconds.trim();
      if (s) out.seconds = /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s;
      if (q.imageUrl.trim()) out.imageUrl = q.imageUrl;
      return out;
    }),
  };
}

const mapQ = (d: QuizDraft, i: number, f: (q: QuestionDraft) => QuestionDraft): QuizDraft => ({
  ...d,
  questions: d.questions.map((q, j) => (j === i ? f(q) : q)),
});

export function updateQuestion(d: QuizDraft, i: number, patch: Partial<Omit<QuestionDraft, "options">>): QuizDraft {
  return mapQ(d, i, (q) => ({ ...q, ...patch }));
}

export function addQuestion(d: QuizDraft): QuizDraft {
  if (d.questions.length >= QUIZ_LIMITS.questionsMax) return d;
  return { ...d, questions: [...d.questions, emptyQuestion()] };
}

export function removeQuestion(d: QuizDraft, i: number): QuizDraft {
  if (d.questions.length <= 1) return d;
  return { ...d, questions: d.questions.filter((_, j) => j !== i) };
}

export function moveQuestion(d: QuizDraft, i: number, dir: -1 | 1): QuizDraft {
  const j = i + dir;
  if (j < 0 || j >= d.questions.length) return d;
  const questions = [...d.questions];
  [questions[i], questions[j]] = [questions[j], questions[i]];
  return { ...d, questions };
}

/** Inserts a copy (with a new id) right after question i. */
export function duplicateQuestion(d: QuizDraft, i: number): QuizDraft {
  const src = d.questions[i];
  if (!src || d.questions.length >= QUIZ_LIMITS.questionsMax) return d;
  const copy: QuestionDraft = { ...src, options: [...src.options], id: nextQuestionId() };
  const questions = [...d.questions];
  questions.splice(i + 1, 0, copy);
  return { ...d, questions };
}

/**
 * Appends questions (e.g. parsed from pasted text), each with a new id. A draft that only holds
 * one completely empty question (a fresh quiz) has it replaced. Stops at the question limit.
 */
export function appendQuestions(d: QuizDraft, added: readonly QuestionDraft[]): QuizDraft {
  const base = d.questions.length === 1 && isEmptyQuestion(d.questions[0]) ? [] : d.questions;
  const room = Math.max(0, QUIZ_LIMITS.questionsMax - base.length);
  const fresh = added.slice(0, room).map((q) => ({ ...q, options: [...q.options], id: nextQuestionId() }));
  if (fresh.length === 0) return d;
  return { ...d, questions: [...base, ...fresh] };
}

/** Moves question `from` to position `to` (drag and drop). */
export function reorderQuestion(d: QuizDraft, from: number, to: number): QuizDraft {
  const n = d.questions.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return d;
  const questions = [...d.questions];
  const [moved] = questions.splice(from, 1);
  questions.splice(to, 0, moved);
  return { ...d, questions };
}

/** Same rule as validateQuiz's image check: a whitespace-free https:// URL with a host. */
export function isPreviewableImage(url: string): boolean {
  const s = url.trim();
  if (!s || /\s/.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.hostname.length > 0;
  } catch {
    return false;
  }
}

export function setOption(d: QuizDraft, qi: number, oi: number, value: string): QuizDraft {
  return mapQ(d, qi, (q) => ({ ...q, options: q.options.map((o, k) => (k === oi ? value : o)) }));
}

export function setCorrect(d: QuizDraft, qi: number, oi: number): QuizDraft {
  return mapQ(d, qi, (q) => (oi >= 0 && oi < q.options.length ? { ...q, correct: oi } : q));
}

export function addOption(d: QuizDraft, qi: number): QuizDraft {
  return mapQ(d, qi, (q) => (q.options.length >= QUIZ_LIMITS.optionsMax ? q : { ...q, options: [...q.options, ""] }));
}

export function removeOption(d: QuizDraft, qi: number, oi: number): QuizDraft {
  return mapQ(d, qi, (q) => {
    if (q.options.length <= QUIZ_LIMITS.optionsMin) return q;
    const options = q.options.filter((_, k) => k !== oi);
    const correct = oi === q.correct ? 0 : oi < q.correct ? q.correct - 1 : q.correct;
    return { ...q, options, correct };
  });
}

const FIELD: Record<string, string> = {
  title: "Başlık",
  description: "Açıklama",
  questions: "Sorular",
  quiz: "Quiz",
  text: "Soru metni",
  options: "Şıklar",
  correct: "Doğru şık",
  seconds: "Süre",
  imageUrl: "Görsel adresi",
};

/** validateQuiz errors ("questions[1].options[0]: boş olamaz") → readable, grouped per question. */
export function describeErrors(errors: readonly string[]): {
  general: string[];
  byQuestion: Record<number, string[]>;
} {
  const general: string[] = [];
  const byQuestion: Record<number, string[]> = {};
  for (const e of errors) {
    const sep = e.indexOf(": ");
    const path = sep >= 0 ? e.slice(0, sep) : "";
    const msg = sep >= 0 ? e.slice(sep + 2) : e;
    const m = /^questions\[(\d+)\](?:\.(\w+)(?:\[(\d+)\])?)?$/.exec(path);
    if (m) {
      const qi = Number(m[1]);
      const field = m[2];
      const label = field === undefined ? "Soru" : m[3] !== undefined ? `${Number(m[3]) + 1}. şık` : (FIELD[field] ?? field);
      (byQuestion[qi] ??= []).push(`${label}: ${msg}`);
    } else {
      general.push(path ? `${FIELD[path] ?? path}: ${msg}` : msg);
    }
  }
  return { general, byQuestion };
}
