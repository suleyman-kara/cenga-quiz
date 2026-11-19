import { t } from "../i18n";

/** Streak pill with a small hand-drawn flame. */
export function StreakBadge({ streak }: { streak: number }) {
  return (
    <p className="streak">
      <svg className="streak__flame" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 2c.6 3 3 4.6 4.6 7a7 7 0 0 1 1.4 4.3A6 6 0 0 1 12 22a6 6 0 0 1-6-6.2c0-2.4 1.2-4.2 2.6-5.5.1 1.7.8 3 2 3.6-.5-3.6.3-7.2 1.4-11.9Z" />
        <path className="streak__core" d="M12 21a3 3 0 0 1-3-3c0-1.6 1.2-2.8 3-4.6 1.8 1.8 3 3 3 4.6a3 3 0 0 1-3 3Z" />
      </svg>
      <span>{t("player.streak", { streak })}</span>
    </p>
  );
}
