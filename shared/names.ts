/** Player display-name rules. Pure: shared by web client, Cloud Functions and RTDB rules. */

export const NAME_MAX = 20;

/**
 * Regex source usable both in JS (`new RegExp(NAME_PATTERN_SOURCE)`) and in RTDB rules `.matches()`.
 * Letters (incl. Turkish), digits, space, `_`, `.`, `-`; length 1..NAME_MAX.
 * Deliberately avoids flags, lookarounds and `\u`/`\p` escapes so RTDB can evaluate it.
 */
export const NAME_PATTERN_SOURCE = `^[a-zA-Z0-9çğıöşüÇĞİÖŞÜ _.-]{1,${NAME_MAX}}$`;

const NAME_RE = new RegExp(NAME_PATTERN_SOURCE);

/** Unicode NFC + trim + collapse inner whitespace runs to a single space. */
export function normalizeName(raw: string): string {
  return String(raw ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
}

/** True if the normalized name matches the pattern and is not blank. */
export function isValidName(name: string): boolean {
  if (typeof name !== "string") return false;
  const n = normalizeName(name);
  return n.length > 0 && NAME_RE.test(n);
}
