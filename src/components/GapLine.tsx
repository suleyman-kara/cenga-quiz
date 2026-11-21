import type { PlayerScore } from "../../shared/types";
import { t } from "../i18n";

/** "Önünde Ayşe var: 120 puan geridesin" / "Liderdesin! 80 puan öndesin" — from server-computed fields. */
export function GapLine({ score }: { score: PlayerScore }) {
  if (score.aheadName !== undefined && typeof score.aheadGap === "number") {
    return <p className="gap">{t("player.behind", { name: score.aheadName, gap: score.aheadGap })}</p>;
  }
  if (typeof score.leadGap === "number" && score.leadGap > 0) {
    return <p className="gap gap--lead">{t("player.leading", { gap: score.leadGap })}</p>;
  }
  return null;
}

/** "▲ 2 sıra yükseldin" / "▼ 1 sıra düştün" — nothing when unchanged or unknown (no prevRank). */
export function MoveLine({ score }: { score: PlayerScore }) {
  if (typeof score.prevRank !== "number" || score.prevRank <= 0) return null;
  const move = score.prevRank - score.rank;
  if (move === 0) return null;
  return (
    <p className={`move move--${move > 0 ? "up" : "down"}`}>
      {t(move > 0 ? "player.movedUp" : "player.movedDown", { count: Math.abs(move) })}
    </p>
  );
}
