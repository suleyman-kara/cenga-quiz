import type { RevealData } from "../../shared/types";
import { club } from "../club.config";

/** At least one player picked the correct option (the reveal celebrates only then). */
export function someoneCorrect(reveal: RevealData): boolean {
  return (reveal.counts[reveal.correct] ?? 0) > 0;
}

/** FNV-1a: small, stable string hash (display-only; not for anything security related). */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A "random" but stable choice colour per player id, so a name keeps its colour on re-render. */
export function choiceForId(id: string, n: number = club.choices.length): number {
  return hashId(id) % n;
}

/** A small stable tilt (degrees, -12..12) for a player's name chip pop-in. */
export function tiltForId(id: string): number {
  return ((hashId(id) >>> 8) % 9) * 3 - 12;
}
