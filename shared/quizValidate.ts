/** Quiz authoring validation. Pure: used by the editor (client) and Cloud Functions (createGame). */
import type { Quiz, QuizQuestion } from "./types";

export const QUIZ_LIMITS = {
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
} as const;

type Result = { ok: true; quiz: Quiz } | { ok: false; errors: string[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Required non-empty trimmed string of at most `max` characters. */
function reqString(v: unknown, path: string, max: number, errors: string[]): string | undefined {
  if (typeof v !== "string") {
    errors.push(`${path}: metin olmalı`);
    return undefined;
  }
  const t = v.trim();
  if (t.length === 0) {
    errors.push(`${path}: boş olamaz`);
    return undefined;
  }
  if (t.length > max) {
    errors.push(`${path}: en fazla ${max} karakter olmalı`);
    return undefined;
  }
  return t;
}

/** Optional string: undefined/null/blank → undefined (omitted). */
function optString(v: unknown, path: string, max: number, errors: string[]): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") {
    errors.push(`${path}: metin olmalı`);
    return undefined;
  }
  const t = v.trim();
  if (t.length === 0) return undefined;
  if (t.length > max) {
    errors.push(`${path}: en fazla ${max} karakter olmalı`);
    return undefined;
  }
  return t;
}

const IMAGE_URL_MAX = 2048;

function isHttpsUrl(s: string): boolean {
  if (/\s/.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.hostname.length > 0;
  } catch {
    return false;
  }
}

function validateQuestion(raw: unknown, path: string, errors: string[]): QuizQuestion | undefined {
  if (!isRecord(raw)) {
    errors.push(`${path}: soru bir nesne olmalı`);
    return undefined;
  }
  const before = errors.length;
  const L = QUIZ_LIMITS;

  const text = reqString(raw.text, `${path}.text`, L.textMax, errors);

  let options: string[] | undefined;
  if (!Array.isArray(raw.options)) {
    errors.push(`${path}.options: şık listesi olmalı`);
  } else if (raw.options.length < L.optionsMin || raw.options.length > L.optionsMax) {
    errors.push(`${path}.options: ${L.optionsMin} ile ${L.optionsMax} arasında şık olmalı`);
  } else {
    const opts = raw.options.map((o, i) => reqString(o, `${path}.options[${i}]`, L.optionMax, errors));
    if (opts.every((o): o is string => o !== undefined)) {
      const keys = opts.map((o) => o.toLocaleLowerCase("tr"));
      if (new Set(keys).size !== keys.length) {
        errors.push(`${path}.options: şıklar birbirinden farklı olmalı`);
      } else {
        options = opts;
      }
    }
  }

  const optionCount = Array.isArray(raw.options) ? raw.options.length : 0;
  const correct = raw.correct;
  const correctOk =
    typeof correct === "number" && Number.isInteger(correct) && correct >= 0 && correct < optionCount;
  if (!correctOk) errors.push(`${path}.correct: geçerli bir şık indeksi olmalı`);

  let seconds: number | undefined;
  if (raw.seconds !== undefined && raw.seconds !== null) {
    const s = raw.seconds;
    if (typeof s !== "number" || !Number.isInteger(s) || s < L.secondsMin || s > L.secondsMax) {
      errors.push(`${path}.seconds: ${L.secondsMin} ile ${L.secondsMax} arasında tam sayı olmalı`);
    } else {
      seconds = s;
    }
  }

  let imageUrl: string | undefined;
  const img = optString(raw.imageUrl, `${path}.imageUrl`, IMAGE_URL_MAX, errors);
  if (img !== undefined) {
    if (isHttpsUrl(img)) imageUrl = img;
    else errors.push(`${path}.imageUrl: https:// ile başlayan geçerli bir adres olmalı`);
  }

  if (errors.length !== before || text === undefined || options === undefined || !correctOk) return undefined;
  const q: QuizQuestion = { text, options, correct: correct as number };
  if (seconds !== undefined) q.seconds = seconds;
  if (imageUrl !== undefined) q.imageUrl = imageUrl;
  return q;
}

/**
 * Validates and sanitizes an untrusted quiz: trims strings, drops blank optional fields,
 * strips unknown keys. Errors are Turkish, prefixed with the field path.
 */
export function validateQuiz(input: unknown): Result {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["quiz: bir nesne olmalı"] };
  const L = QUIZ_LIMITS;

  const title = reqString(input.title, "title", L.titleMax, errors);
  const description = optString(input.description, "description", L.descriptionMax, errors);

  const questions: QuizQuestion[] = [];
  const rawQs = input.questions;
  if (!Array.isArray(rawQs)) {
    errors.push("questions: soru listesi olmalı");
  } else if (rawQs.length < L.questionsMin || rawQs.length > L.questionsMax) {
    errors.push(`questions: ${L.questionsMin} ile ${L.questionsMax} arasında soru olmalı`);
  } else {
    rawQs.forEach((rq, i) => {
      const q = validateQuestion(rq, `questions[${i}]`, errors);
      if (q) questions.push(q);
    });
  }

  if (errors.length > 0 || title === undefined) return { ok: false, errors };
  const quiz: Quiz = { title, questions };
  if (description !== undefined) quiz.description = description;
  return { ok: true, quiz };
}

/** Effective duration in seconds: the question's own value or the default, clamped to limits. */
export function questionSeconds(q: QuizQuestion, defaultSeconds: number): number {
  const raw = typeof q.seconds === "number" && Number.isFinite(q.seconds) ? q.seconds : defaultSeconds;
  const v = Number.isFinite(raw) ? Math.round(raw) : QUIZ_LIMITS.secondsMin;
  return Math.min(QUIZ_LIMITS.secondsMax, Math.max(QUIZ_LIMITS.secondsMin, v));
}
