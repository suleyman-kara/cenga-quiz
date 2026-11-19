/**
 * Player session persisted in sessionStorage so a refresh keeps the player in
 * the same game (Firebase Auth keeps the same anonymous uid on its own).
 */
export interface PlayerSession {
  pin: string;
  name: string;
}

const KEY = "quiz.session";
const answeredKey = (pin: string, qIndex: number) => `quiz.answered.${pin}.${qIndex}`;

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadSession(): PlayerSession | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PlayerSession>;
    return typeof v.pin === "string" && typeof v.name === "string" ? { pin: v.pin, name: v.name } : null;
  } catch {
    return null;
  }
}

export function saveSession(s: PlayerSession): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: refresh will just ask to rejoin */
  }
}

export function clearSession(): void {
  try {
    const s = storage();
    if (!s) return;
    for (const k of Object.keys(s)) if (k === KEY || k.startsWith("quiz.answered.")) s.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function markAnswered(pin: string, qIndex: number, choice: number): void {
  try {
    storage()?.setItem(answeredKey(pin, qIndex), String(choice));
  } catch {
    /* ignore */
  }
}

export function answeredChoice(pin: string, qIndex: number): number | null {
  try {
    const raw = storage()?.getItem(answeredKey(pin, qIndex));
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}
