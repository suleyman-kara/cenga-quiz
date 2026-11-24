/**
 * Player session persisted in localStorage, keyed by PIN, so a refresh, a closed tab or a
 * phone that killed the browser can rejoin the same game (Firebase Auth keeps the same
 * anonymous uid on its own). Sessions expire after the room's abandon window.
 */
import { club } from "../club.config";

export interface PlayerSession {
  pin: string;
  name: string;
}

export const SESSION_TTL_MS = club.game.abandonedAfterHours * 3_600_000;

const PREFIX = "quiz.session.";
const LAST = "quiz.lastPin";
const sessionKey = (pin: string) => `${PREFIX}${pin}`;
const answeredPrefix = (pin: string) => `quiz.answered.${pin}.`;
const answeredKey = (pin: string, qIndex: number) => `${answeredPrefix(pin)}${qIndex}`;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSession(pin: string): PlayerSession | null {
  try {
    const raw = storage()?.getItem(sessionKey(pin));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PlayerSession> & { savedAt?: number };
    if (typeof v.pin !== "string" || v.pin !== pin || typeof v.name !== "string") return null;
    if (typeof v.savedAt !== "number" || Date.now() - v.savedAt > SESSION_TTL_MS) return null;
    return { pin: v.pin, name: v.name };
  } catch {
    return null;
  }
}

/** The most recently joined game, if its session is still valid. */
export function loadLastSession(): PlayerSession | null {
  try {
    const pin = storage()?.getItem(LAST);
    return pin ? loadSession(pin) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: PlayerSession): void {
  try {
    storage()?.setItem(sessionKey(s.pin), JSON.stringify({ ...s, savedAt: Date.now() }));
    storage()?.setItem(LAST, s.pin);
  } catch {
    /* storage unavailable: refresh will just ask to rejoin */
  }
}

export function clearSession(pin: string): void {
  try {
    const s = storage();
    if (!s) return;
    for (const k of Object.keys(s)) if (k === sessionKey(pin) || k.startsWith(answeredPrefix(pin))) s.removeItem(k);
    if (s.getItem(LAST) === pin) s.removeItem(LAST);
  } catch {
    /* ignore */
  }
}

/**
 * The game is over (ended or gone): a fresh visit to the join screen should not jump back to it.
 * The session itself stays, so this game's own page still shows its final screen on refresh.
 */
export function finishSession(pin: string): void {
  try {
    const s = storage();
    if (s?.getItem(LAST) === pin) s.removeItem(LAST);
  } catch {
    /* ignore */
  }
}

/** Call ONLY after the server accepted the answer (the RTDB set() resolved). */
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
