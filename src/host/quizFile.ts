/**
 * Quiz ⇄ file helpers for the host panel: JSON download (client-side Blob, no server) and the
 * title of a copied quiz. The downloaded file follows quizzes/quiz.schema.json and can be
 * imported again with "JSON'dan quiz içe aktar".
 *
 * No "$schema" key is written: the schema is not served by the app, and a relative path such
 * as "./quiz.schema.json" would only resolve next to the repo's quizzes/ folder. The key is
 * optional in the schema, so authors can add it themselves when editing the file in the repo.
 */
import { QUIZ_LIMITS } from "../../shared/quizValidate";
import type { Quiz } from "../../shared/types";

/** Pretty JSON with a fixed key order; blank optional fields are left out. */
export function quizToJson(quiz: Quiz): string {
  const out: Record<string, unknown> = { title: quiz.title };
  if (quiz.description) out.description = quiz.description;
  out.questions = quiz.questions.map((q) => {
    const item: Record<string, unknown> = { text: q.text, options: [...q.options], correct: q.correct };
    if (q.seconds !== undefined && q.seconds !== null) item.seconds = q.seconds;
    if (q.imageUrl) item.imageUrl = q.imageUrl;
    return item;
  });
  return `${JSON.stringify(out, null, 2)}\n`;
}

const TR_ASCII: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** "Genel Kültür: Tur 1" → "genel-kultur-tur-1.json" (ASCII only; "quiz.json" when nothing is left). */
export function quizFileName(title: string): string {
  return `${slug(title) || "quiz"}.json`;
}

/** Title for a copy: "<title><suffix>", shortening the title so the result fits the limit. */
export function copyTitle(title: string, suffix: string): string {
  const room = Math.max(0, QUIZ_LIMITS.titleMax - suffix.length);
  return `${title.trim().slice(0, room).trimEnd()}${suffix}`;
}

/** Starts a browser download of the quiz as a .json file. */
export function downloadQuiz(quiz: Quiz): void {
  downloadText(quizFileName(quiz.title), quizToJson(quiz), "application/json;charset=utf-8");
}

/** ASCII slug for file names ("Genel Kültür: Tur 1" → "genel-kultur-tur-1"); "" when nothing is left. */
export function slug(title: string): string {
  return title
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) => TR_ASCII[c] ?? c)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** Starts a browser download of `text` as a file. */
export function downloadText(fileName: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    // Give the browser a moment to start the download before the URL is released.
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}
