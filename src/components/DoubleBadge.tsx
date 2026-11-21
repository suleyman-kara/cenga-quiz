import { t } from "../i18n";

/** "2× PUAN" — one of the last club.game.doublePointsLastN questions (PublicQuestion.double). */
export function DoubleBadge({ className }: { className?: string }) {
  return (
    <p className={["double-badge", className].filter(Boolean).join(" ")} title={t("question.doubleHint")}>
      <span aria-hidden="true">{t("question.double")}</span>
      <span className="sr-only">{t("question.doubleHint")}</span>
    </p>
  );
}
