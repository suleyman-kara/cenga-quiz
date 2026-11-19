import type { CSSProperties } from "react";
import type { LeaderboardEntry } from "../../shared/types";
import { t } from "../i18n";
import { displayName } from "../host/displayNames";

interface Props {
  entries: LeaderboardEntry[];
  limit?: number;
  /** also show each player's correct-answer count */
  detailed?: boolean;
  /** accessible name of the list (defaults to the leaderboard title) */
  label?: string;
  className?: string;
}

export function Leaderboard({ entries, limit = 10, detailed = false, label, className }: Props) {
  const rows = entries.slice(0, limit);
  if (rows.length === 0) return <p className="muted">{t("leaderboard.empty")}</p>;
  const top = Math.max(1, rows[0]?.score ?? 1);
  const classes = ["leaderboard", rows.length > 5 && "leaderboard--dense", detailed && "leaderboard--detailed", className]
    .filter(Boolean)
    .join(" ");
  return (
    <ol className={classes} aria-label={label ?? t("leaderboard.title")}>
      {rows.map((e, i) => (
        <li
          key={`${e.rank}-${e.name}-${i}`}
          className="leaderboard__row"
          data-rank={e.rank}
          style={{ "--i": i, "--share": Math.max(0, e.score) / top } as CSSProperties}
        >
          <span className="leaderboard__rank">{e.rank}</span>
          <span className="leaderboard__name">{displayName(e.name, i + 1).label}</span>
          {detailed && typeof e.correctCount === "number" && (
            <span className="leaderboard__correct">{t("leaderboard.correct", { count: e.correctCount })}</span>
          )}
          <span className="leaderboard__score">{e.score}</span>
        </li>
      ))}
    </ol>
  );
}
