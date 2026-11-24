/** Pure helpers for the RTDB join/leave triggers (games/{pin}/players/{uid}). */
import { NAME_MAX } from "../../../shared/names";
import { nameKey } from "./sanitize";

/**
 * RTDB key that reserves a display name in a room: case-insensitive (Turkish İ/I aware, see
 * nameKey) and safe as a key (RTDB forbids . # $ / [ ] and control characters).
 */
export function nameClaimKey(name: string): string {
  return encodeURIComponent(nameKey(name)).replace(/\./g, "%2E");
}

/** "name (n)" shortened so it fits NAME_MAX (n ≥ 2). */
export function suffixedName(name: string, n: number): string {
  const suffix = ` (${n})`;
  return name.slice(0, NAME_MAX - suffix.length).trimEnd() + suffix;
}

/** meta.full for a player count (joins are refused by the rules while full). */
export function fullAfterCount(playerCount: number, maxPlayers: number): boolean {
  return playerCount >= maxPlayers;
}
