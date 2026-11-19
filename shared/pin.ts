/** Six-digit game PIN helpers. Pure. */

const PIN_MIN = 100000;
const PIN_SPAN = 900000;

/** Returns "100000".."999999". `random` must return [0, 1); out-of-range values are clamped. */
export function generatePin(random: () => number = Math.random): string {
  const r = random();
  const offset = Number.isFinite(r) ? Math.min(PIN_SPAN - 1, Math.max(0, Math.floor(r * PIN_SPAN))) : 0;
  return String(PIN_MIN + offset);
}

/** Exactly six ASCII digits, first digit not 0. */
export function isValidPin(s: unknown): s is string {
  return typeof s === "string" && /^[1-9][0-9]{5}$/.test(s);
}
