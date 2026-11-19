import { t } from "../i18n";

/** Milliseconds left until `endsAt` on the server clock (never negative). */
export function remaining(endsAt: number, serverNow: number): number {
  if (!endsAt) return 0;
  return Math.max(0, endsAt - serverNow);
}

/** Whole seconds to display: rounds up, so "0" only appears when time is really up. */
export function remainingSeconds(endsAt: number, serverNow: number): number {
  return Math.ceil(remaining(endsAt, serverNow) / 1000);
}

interface Props {
  endsAt: number;
  totalSeconds: number;
  serverNow: number;
  size?: "sm" | "lg";
}

const R = 44;
const CIRC = 2 * Math.PI * R;

export function Countdown({ endsAt, totalSeconds, serverNow, size = "sm" }: Props) {
  const ms = remaining(endsAt, serverNow);
  const secs = remainingSeconds(endsAt, serverNow);
  const fraction = totalSeconds > 0 ? Math.min(1, ms / (totalSeconds * 1000)) : 0;
  return (
    <div
      className={`countdown countdown--${size}`}
      role="timer"
      aria-label={t("hostGame.secondsLeft", { seconds: secs })}
      data-urgent={secs <= 5 || undefined}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="countdown__track" cx="50" cy="50" r={R} />
        <circle
          className="countdown__arc"
          cx="50"
          cy="50"
          r={R}
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - fraction)}
        />
      </svg>
      <span className="countdown__num">{secs}</span>
    </div>
  );
}
