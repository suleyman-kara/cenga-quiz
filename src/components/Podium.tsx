import type { LeaderboardEntry } from "../../shared/types";
import { t } from "../i18n";
import { displayName } from "../host/displayNames";
import { Confetti } from "./Confetti";

/** Top three on steps, ordered 2 · 1 · 3 visually; DOM order stays 1, 2, 3. Revealed 3rd → 2nd → 1st. */
export function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const top = entries.slice(0, 3);
  return (
    <div className="podium-wrap">
      {top.length > 0 && <Confetti />}
      <ol className="podium" aria-label={t("podium.title")}>
        {top.map((e, i) => (
          <li key={`${e.rank}-${e.name}-${i}`} className={`podium__step podium__step--${i + 1}`}>
            <span className="podium__who">
              <span className="podium__name">{displayName(e.name, i + 1).label}</span>
              <span className="podium__score">{e.score}</span>
            </span>
            <span className="podium__block" aria-label={t("podium.place", { rank: e.rank })}>
              {e.rank}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
