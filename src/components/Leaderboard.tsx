import type { CSSProperties } from "react";
import type { LeaderboardEntry } from "../../shared/types";
import { t } from "../i18n";
import { displayName } from "../host/displayNames";

interface Props {
  entries: LeaderboardEntry[];
  limit?: number;
  /** also show each player's correct-answer count */
  detailed?: boolean;
  /**
   * show what the last question changed: rows slide from their previous position (FLIP, CSS only),
   * ▲/▼ movement indicators and a streak badge (streak ≥ 2)
   */
  movement?: boolean;
  /** accessible name of the list (defaults to the leaderboard title) */
  label?: string;
  className?: string;
}

/**
 * Previous display index of each row (by prevRank), for the slide-in. Ties in prevRank get
 * consecutive slots; rows from outside the shown list start just below it; unknown → own index.
 */
export function previousIndexes(rows: readonly LeaderboardEntry[]): number[] {
  const out = rows.map((_, i) => i);
  const known = rows
    .map((e, i) => ({ i, prev: e.prevRank }))
    .filter((x): x is { i: number; prev: number } => typeof x.prev === "number" && x.prev > 0)
    .sort((a, b) => a.prev - b.prev || a.i - b.i);
  let last = -1;
  for (const { i, prev } of known) {
    last = Math.max(prev - 1, last + 1);
    out[i] = Math.min(last, rows.length);
  }
  return out;
}

/** places moved since the previous question: > 0 up, < 0 down, 0 unchanged or unknown */
export function rankMove(e: { rank: number; prevRank?: number }): number {
  return typeof e.prevRank === "number" && e.prevRank > 0 ? e.prevRank - e.rank : 0;
}

export function Leaderboard({ entries, limit = 10, detailed = false, movement = false, label, className }: Props) {
  const rows = entries.slice(0, limit);
  if (rows.length === 0) return <p className="muted">{t("leaderboard.empty")}</p>;
  const top = Math.max(1, rows[0]?.score ?? 1);
  const prevIndex = movement ? previousIndexes(rows) : null;
  const classes = [
    "leaderboard",
    rows.length > 5 && "leaderboard--dense",
    detailed && "leaderboard--detailed",
    movement && "leaderboard--moves",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <ol className={classes} aria-label={label ?? t("leaderboard.title")}>
      {rows.map((e, i) => {
        const move = movement ? rankMove(e) : 0;
        const style: Record<string, number> = { "--i": i, "--share": Math.max(0, e.score) / top };
        if (prevIndex) style["--shift"] = prevIndex[i] - i;
        return (
          <li
            key={`${e.rank}-${e.name}-${i}`}
            className="leaderboard__row"
            data-rank={e.rank}
            data-move={move > 0 ? "up" : move < 0 ? "down" : undefined}
            style={style as CSSProperties}
          >
            <span className="leaderboard__rank">{e.rank}</span>
            <span className="leaderboard__name">{displayName(e.name, i + 1).label}</span>
            {movement && (
              <span className="leaderboard__meta">
                {typeof e.streak === "number" && e.streak >= 2 && (
                  <span
                    className="leaderboard__streak"
                    role="img"
                    aria-label={t("leaderboard.streak", { streak: e.streak })}
                    title={t("leaderboard.streak", { streak: e.streak })}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M12 2c.6 3 3 4.6 4.6 7a7 7 0 0 1 1.4 4.3A6 6 0 0 1 12 22a6 6 0 0 1-6-6.2c0-2.4 1.2-4.2 2.6-5.5.1 1.7.8 3 2 3.6-.5-3.6.3-7.2 1.4-11.9Z" />
                    </svg>
                    <span aria-hidden="true">{e.streak}</span>
                  </span>
                )}
                {move !== 0 && (
                  <span
                    className={`leaderboard__move leaderboard__move--${move > 0 ? "up" : "down"}`}
                    role="img"
                    aria-label={t(move > 0 ? "leaderboard.movedUp" : "leaderboard.movedDown", { count: Math.abs(move) })}
                  >
                    <span aria-hidden="true">{`${move > 0 ? "▲" : "▼"}${Math.abs(move)}`}</span>
                  </span>
                )}
              </span>
            )}
            {detailed && typeof e.correctCount === "number" && (
              <span className="leaderboard__correct">{t("leaderboard.correct", { count: e.correctCount })}</span>
            )}
            <span className="leaderboard__score">{e.score}</span>
          </li>
        );
      })}
    </ol>
  );
}
