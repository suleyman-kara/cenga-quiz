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
