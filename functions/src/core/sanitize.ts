import type { PlayerEntry } from "../../../shared/types";
import { NAME_MAX } from "../../../shared/names";
import { isNameAllowed } from "../../../shared/profanity";

/** Case-insensitive key with Turkish İ/I handling ("ALİ" ≡ "Ali", "IŞIK" ≡ "ışık"). */
export function nameKey(name: string): string {
  return name.normalize("NFC").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
}

/** uids in join order (joinedAt, then uid for determinism). */
export function joinOrder(players: Record<string, PlayerEntry>): string[] {
  return Object.keys(players).sort(
    (a, b) => (players[a].joinedAt ?? 0) - (players[b].joinedAt ?? 0) || (a < b ? -1 : a > b ? 1 : 0),
  );
}

/**
 * Final names for the game, in join order: blocked names become "<prefix> N", later
 * case-insensitive duplicates get " (2)", " (3)"… (shortened to fit NAME_MAX).
 * Returns only the uids whose name changes.
 */
export function sanitizePlayerNames(players: Record<string, PlayerEntry>, prefix: string): Record<string, string> {
  const order = joinOrder(players);
  const taken = new Set<string>();
  const changes: Record<string, string> = {};
  // Clean names reserve their key first so generated/suffixed names never steal one.
  const clean = new Map<string, boolean>();
  for (const uid of order) clean.set(uid, isNameAllowed(players[uid].name ?? ""));
  const firstOwner = new Map<string, string>();
  for (const uid of order) {
    if (!clean.get(uid)) continue;
    const key = nameKey(players[uid].name);
    if (!firstOwner.has(key)) {
      firstOwner.set(key, uid);
      taken.add(key);
    }
  }
  let generated = 0;
  for (const uid of order) {
    const name = players[uid].name ?? "";
    if (!clean.get(uid)) {
      let candidate: string;
      do candidate = `${prefix} ${++generated}`;
      while (taken.has(nameKey(candidate)));
      taken.add(nameKey(candidate));
      changes[uid] = candidate;
      continue;
    }
    if (firstOwner.get(nameKey(name)) === uid) continue;
    for (let n = 2; ; n++) {
      const suffix = ` (${n})`;
      const candidate = name.slice(0, NAME_MAX - suffix.length).trimEnd() + suffix;
      if (!taken.has(nameKey(candidate))) {
        taken.add(nameKey(candidate));
        changes[uid] = candidate;
        break;
      }
    }
  }
  return changes;
}
