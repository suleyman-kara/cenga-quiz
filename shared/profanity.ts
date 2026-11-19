/** Display-name profanity check. Pure; used by Cloud Functions (authoritative) and the client (hint). */
import { BLOCKED_SUBSTRINGS, BLOCKED_WORDS } from "./blocklist";

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

export interface MatchForm {
  /** letter-only words, in order */
  tokens: string[];
  /** all tokens joined: spaces and punctuation removed */
  compact: string;
}

/**
 * Lowercase with Turkish İ/I handling, fold Turkish letters and accents to ASCII
 * (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u), map leetspeak, split on anything that is not a–z.
 */
export function normalizeForMatch(raw: string): MatchForm {
  const lowered = String(raw ?? "")
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
  const mapped = Array.from(lowered, (ch) => LEET[ch] ?? ch).join("");
  const tokens = mapped.split(/[^a-z]+/).filter(Boolean);
  return { tokens, compact: tokens.join("") };
}

const SUBSTRINGS = BLOCKED_SUBSTRINGS.map((w) => normalizeForMatch(w).compact).filter(Boolean);
const WORDS = new Set(BLOCKED_WORDS.map((w) => normalizeForMatch(w).compact).filter(Boolean));

/** False when the name contains a blocked word (after normalization). */
export function isNameAllowed(name: string): boolean {
  const { tokens, compact } = normalizeForMatch(name);
  if (SUBSTRINGS.some((w) => compact.includes(w))) return false;
  if (WORDS.has(compact)) return false;
  return !tokens.some((t) => WORDS.has(t));
}
