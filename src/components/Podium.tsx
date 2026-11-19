import type { LeaderboardEntry } from "../../shared/types";
import { t } from "../i18n";

/** Top three on steps, ordered 2 · 1 · 3 visually; DOM order stays 1, 2, 3. */
export function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const top = entries.slice(0, 3);
  return (
    <ol className="podium">
      {top.map((e, i) => (
        <li key={`${e.rank}-${e.name}-${i}`} className={`podium__step podium__step--${i + 1}`}>
          <span className="podium__name">{e.name}</span>
          <span className="podium__score">{e.score}</span>
          <span className="podium__block" aria-label={t("podium.place", { rank: e.rank })}>
            {e.rank}
          </span>
        </li>
      ))}
    </ol>
  );
}
