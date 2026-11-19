import { t } from "../i18n";

/** Skeleton placeholder while live data arrives; keeps the layout from jumping. */
export function Loading({ variant = "question" }: { variant?: "question" | "text" }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="sr-only">{t("common.loading")}</span>
      <span className="skeleton__line skeleton__line--title" aria-hidden="true" />
      <span className="skeleton__line" aria-hidden="true" />
      <span className="skeleton__line skeleton__line--short" aria-hidden="true" />
      {variant === "question" && (
        <span className="skeleton__blocks" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
      )}
    </div>
  );
}
