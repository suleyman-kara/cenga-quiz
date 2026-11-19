import { isNameAllowed } from "../../shared/profanity";
import type { PlayerListItem } from "../game/hooks";
import { t } from "../i18n";

/**
 * Display-only masking for the projector and host lists. The server sanitizes names on join;
 * until then (or if it ever misses one) a blocked name must not reach the big screen. Data is
 * never changed and moderation (kick) works by uid, so the real name is not shown anywhere.
 */
export function displayName(name: string, n: number): { label: string; masked: boolean } {
  return isNameAllowed(name) ? { label: name, masked: false } : { label: t("hostGame.maskedName", { n }), masked: true };
}

export interface DisplayPlayer extends PlayerListItem {
  label: string;
  masked: boolean;
  /** another visible player has the same name (case-insensitive) */
  duplicate: boolean;
}

const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");

/** Players in the given order with masked labels (numbered by position) and duplicate marks. */
export function displayPlayers(players: readonly PlayerListItem[]): DisplayPlayer[] {
  const shown = players.map((p, i) => ({ ...p, ...displayName(p.name, i + 1) }));
  const counts = new Map<string, number>();
  for (const p of shown) if (!p.masked) counts.set(nameKey(p.name), (counts.get(nameKey(p.name)) ?? 0) + 1);
  return shown.map((p) => ({ ...p, duplicate: !p.masked && (counts.get(nameKey(p.name)) ?? 0) > 1 }));
}
