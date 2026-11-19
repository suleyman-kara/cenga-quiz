import type { CSSProperties } from "react";
import type { LeaderboardEntry } from "../../shared/types";
import { t } from "../i18n";

interface Props {
  entries: LeaderboardEntry[];
  limit?: number;
}

export function Leaderboard({ entries, limit = 5 }: Props) {
  const rows = entries.slice(0, limit);
  if (rows.length === 0) return <p className="muted">{t("leaderboard.empty")}</p>;
  const top = Math.max(1, rows[0]?.score ?? 1);
  return (
    <ol className="leaderboard" aria-label={t("leaderboard.title")}>
      {rows.map((e, i) => (
        <li
          key={`${e.rank}-${e.name}-${i}`}
          className="leaderboard__row"
          data-rank={e.rank}
          style={{ "--i": i, "--share": Math.max(0, e.score) / top } as CSSProperties}
        >
          <span className="leaderboard__rank">{e.rank}</span>
          <span className="leaderboard__name">{e.name}</span>
          <span className="leaderboard__score">{e.score}</span>
        </li>
      ))}
    </ol>
  );
}
