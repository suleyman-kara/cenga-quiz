/**
 * Turns questions pasted as plain text (from a document, a chat or a teacher's handout) into
 * editor drafts. Pure. Typical input:
 *
 *   1. Başkent neresi?
 *   A) İzmir
 *   B) Ankara
 *   Doğru Cevap: B
 *
 * Also understood: "1)" / "Soru 1:" numbers, "A." / "a)" / "A -" options, "Cevap: b",
 * "Doğru Cevap: A) <option text>", an answer given as the option text, and an answer key after
 * all questions ("CEVAP ANAHTARI" heading, or just lines like "1. C) Fortran" / "2. B").
 * Lines before the first question (titles, headings) are ignored. Problems never stop parsing;
 * they come back as Turkish warnings and the editor's own validation does the rest.
 */
import { QUIZ_LIMITS } from "../../shared/quizValidate";
import type { QuestionDraft } from "./quizDraft";

export interface ParsedQuestions {
  questions: QuestionDraft[];
  warnings: string[];
}

interface Building {
  /** number written in the text (for warnings and the answer key), else its position */
  num: number;
  textLines: string[];
  options: string[];
  /** option letter (a, b, …) → option index, as written */
  letters: Map<string, number>;
  answer?: string;
}

const LETTERS = "abcdefgh";

/** Lower-cases for keyword matching, Turkish-aware ("DOĞRU CEVAP" → "doğru cevap"). */
const lower = (s: string) => s.toLocaleLowerCase("tr");

/** Strips quote characters (straight and typographic) around a value. */
const unquote = (s: string) => s.replace(/^["'“”‘’«»„]+|["'“”‘’«»„]+$/g, "").trim();

/** Normalizes one raw line: no-break spaces, zero-width chars, markdown bold, bullets. */
function clean(raw: string): string {
  return raw
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\*\*|__/g, "")
    .replace(/^\s*[•▪◦·]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const QUESTION_RE = /^(?:soru\s*)?(\d{1,3})\s*[.):\-–]\s*(.+)$/i;
const ANSWER_RE = /^(?:doğru\s*(?:cevap|yanıt|şık)|cevap|yanıt|answer|correct(?:\s*answer)?)\s*[:：]\s*(.*)$/;
const ANSWER_LOOSE_RE = /^doğru\s*(?:cevap|yanıt|şık)\s*[-–]?\s*(.+)$/;
const KEY_HEADING_RE = /^(?:cevap\s*anahtar[ıi]?|cevaplar|doğru\s*cevaplar|yanıtlar|answer\s*key|answers)\s*:?$/;
const EXPLANATION_RE = /^(?:açıklama|explanation|not)\s*:/;

/** "A) text", "a. text", "A - text", "(B) text" → [letter, text]. */
function matchOption(line: string): [string, string] | null {
  const m = /^\(?([a-h])\s*(\)|\.|:|[-–])\s*(.*)$/i.exec(line);
  if (!m) return null;
  const [, letter, mark, rest] = m;
  // "A.B.D. …" or "A-vitamini" are text, not options.
  if ((mark === "." || mark === "-" || mark === "–") && rest !== "" && !/^\s/.test(line.slice(line.indexOf(mark) + 1))) {
    return null;
  }
  return [letter.toLocaleLowerCase("en"), rest.trim()];
}

/** An answer-key entry "1. C", "2) b", "3 - A) Fortran", "4. Fortran" (text only in key mode). */
function matchKeyLine(line: string, allowText: boolean): { num: number; value: string } | null {
  const m = /^(\d{1,3})\s*[.):\-–]?\s*(.+)$/.exec(line);
  if (!m) return null;
  const value = m[2].trim();
  // A lone letter, or a letter with a mark: "C", "b)", "C) Fortran", "A - Fortran"; not "A vitamini…".
  if (/^\(?[a-h](?:\s*$|\s*[).:](?:\s|$)|\s+[-–]\s)/i.test(value)) {
    return { num: Number(m[1]), value };
  }
  return allowText ? { num: Number(m[1]), value } : null;
}

/** Resolves an answer value ("B", "b)", "A) Makine", "Ankara") to an option index. */
function resolveAnswer(raw: string, q: Building, options: string[]): { index: number } | { missing: string } {
  const value = unquote(raw);
  const key = lower(value);
  // Whole option text first, so "A vitamini" is not read as letter A.
  const byText = options.findIndex((o) => lower(o.trim()) === key);
  if (byText >= 0) return { index: byText };
  const letter = /^\(?([a-h])\)?(?=$|[\s.):\-–])/i.exec(value);
  if (letter) {
    const l = letter[1].toLocaleLowerCase("en");
    const idx = q.letters.get(l) ?? LETTERS.indexOf(l);
    return idx >= 0 && idx < options.length ? { index: idx } : { missing: l.toLocaleUpperCase("en") };
  }
  const digit = /^([1-8])$/.exec(value);
  if (digit) {
    const idx = Number(digit[1]) - 1;
    return idx < options.length ? { index: idx } : { missing: digit[1] };
  }
  return { missing: value };
}

export function parseQuestionsText(text: string): ParsedQuestions {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map(clean);
  const built: Building[] = [];
  let current: Building | null = null;
  let keyMode = false;
  const keyAnswers = new Map<number, string>();
  /** plain lines seen before any question: a heading, or the text of an unnumbered first question */
  let pending: string[] = [];

  const nextNonBlank = (from: number) => {
    for (let k = from; k < lines.length; k++) if (lines[k]) return lines[k];
    return "";
  };
  const start = (num: number, firstLine: string) => {
    current = { num, textLines: firstLine ? [firstLine] : [], options: [], letters: new Map() };
    built.push(current);
    pending = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const low = lower(line);
    const cur = current as Building | null;

    if (KEY_HEADING_RE.test(low)) {
      keyMode = true;
      current = null;
      continue;
    }

    if (keyMode) {
      const entry = matchKeyLine(line, true);
      if (entry) keyAnswers.set(entry.num, entry.value);
      continue;
    }

    const ans = ANSWER_RE.exec(low) ?? ANSWER_LOOSE_RE.exec(low);
    if (ans && cur) {
      // Take the value from the original line (keeps case of option text).
      cur.answer = line.slice(line.length - ans[1].length).trim();
      continue;
    }

    // "1. C" after questions with options: the start of an answer key without a heading.
    if (built.length > 0 && (!cur || cur.options.length > 0)) {
      const entry = matchKeyLine(line, false);
      if (entry && built.some((b) => b.options.length > 0)) {
        keyMode = true;
        current = null;
        keyAnswers.set(entry.num, entry.value);
        continue;
      }
    }

    const opt = matchOption(line);
    if (opt && (cur || pending.length > 0)) {
      if (!cur) start(built.length + 1, pending[pending.length - 1]);
      const q = current as unknown as Building;
      if (!q.letters.has(opt[0])) q.letters.set(opt[0], q.options.length);
      q.options.push(opt[1]);
      continue;
    }

    const qm = QUESTION_RE.exec(line);
    if (qm) {
      start(Number(qm[1]), qm[2].trim());
      continue;
    }

    if (EXPLANATION_RE.test(low)) continue;

    if (!cur) {
      pending.push(line);
    } else if (cur.options.length === 0) {
      cur.textLines.push(line);
    } else if (matchOption(nextNonBlank(i + 1))) {
      // An unnumbered question that follows the previous one.
      start(built.length + 1, line);
    } else if (cur.answer === undefined) {
      // A long option that wrapped onto the next line.
      cur.options[cur.options.length - 1] = `${cur.options[cur.options.length - 1]} ${line}`.trim();
    }
  }

  const warnings: string[] = [];
  const questions: QuestionDraft[] = [];
  const max = QUIZ_LIMITS.optionsMax;
  built.forEach((q, idx) => {
    const label = `${q.num}. soru`;
    let options = q.options;
    if (options.length > max) {
      warnings.push(`${label}: en fazla ${max} şık olabilir, fazlası atıldı`);
      options = options.slice(0, max);
    } else if (options.length < QUIZ_LIMITS.optionsMin) {
      warnings.push(`${label}: en az ${QUIZ_LIMITS.optionsMin} şık gerekli`);
      options = [...options, ...Array<string>(QUIZ_LIMITS.optionsMin - options.length).fill("")];
    }
    const sameNum = built.findIndex((b) => b.num === q.num) === idx;
    const raw = q.answer ?? (sameNum ? keyAnswers.get(q.num) : undefined) ?? keyAnswers.get(idx + 1);
    let correct = 0;
    if (raw === undefined || !unquote(raw)) {
      warnings.push(`${label}: doğru cevap bulunamadı`);
    } else {
      const r = resolveAnswer(raw, q, options);
      if ("index" in r) correct = r.index;
      else warnings.push(`${label}: doğru cevap (${r.missing}) şıklar arasında yok`);
    }
    questions.push({ text: q.textLines.join(" ").trim(), options, correct, seconds: "", imageUrl: "" });
  });
  return { questions, warnings };
}
