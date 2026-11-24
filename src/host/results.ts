/** CSV export of an archived game (gameResults/{id}), built in the browser. */
import type { GameResultDoc } from "../../shared/types";
import { downloadText, slug } from "./quizFile";

const SEP = ";";
const BOM = "﻿";

/**
 * One CSV field: quoted when it holds the separator, a quote or a line break; a leading = + - @
 * is prefixed with ' so a spreadsheet never runs a player's name as a formula.
 */
function field(v: string | number): string {
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(rows: (string | number)[][]): string {
  // BOM + ";" + CRLF: what Excel with Turkish settings opens directly
  return BOM + rows.map((r) => r.map(field).join(SEP)).join("\r\n") + "\r\n";
}

export function rankingCsv(doc: GameResultDoc): string {
  return csv([
    ["Sıra", "Takma ad", "Puan", "Doğru sayısı"],
    ...doc.results.map((r) => [r.rank, r.name, r.score, r.correctCount]),
  ]);
}

const letter = (i: number) => String.fromCharCode(65 + i);

export function questionsCsv(doc: GameResultDoc): string {
  return csv([
    ["Soru", "Metin", "Doğru şık", "Cevaplayan", "Doğru cevaplayan", "Doğru oranı (%)"],
    ...(doc.questions ?? []).map((q) => {
      const answered = q.counts.reduce((a, b) => a + b, 0);
      const right = q.counts[q.correct] ?? 0;
      return [q.index + 1, q.text, letter(q.correct), answered, right, answered ? Math.round((right / answered) * 100) : 0];
    }),
  ]);
}

/** "<title>-<yyyy-mm-dd>-<kind>.csv" (date of the game, UTC+3 does not matter for a file name). */
export function resultFileName(doc: GameResultDoc, kind: string): string {
  const date = new Date(doc.endedAt).toISOString().slice(0, 10);
  return `${slug(doc.title) || "sonuc"}-${date}-${kind}.csv`;
}

export function downloadResultCsv(doc: GameResultDoc, kind: "siralama" | "sorular"): void {
  const text = kind === "siralama" ? rankingCsv(doc) : questionsCsv(doc);
  downloadText(resultFileName(doc, kind), text, "text/csv;charset=utf-8");
}
