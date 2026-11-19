import type { CSSProperties } from "react";
import type { LeaderboardEntry } from "../../shared/types";
import { club } from "../club.config";
import { t } from "../i18n";
import { displayName } from "../host/displayNames";
import { ChoiceShape } from "./ChoiceShape";

/** Deterministic pseudo-random in [0,1) so confetti looks scattered but renders the same every time. */
const rand = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const PIECES = Array.from({ length: 28 }, (_, i) => ({
  x: Math.round(rand(i + 1) * 100),
  delay: Math.round(rand(i + 31) * 1400),
  dur: 2600 + Math.round(rand(i + 61) * 1800),
  spin: Math.round(rand(i + 91) * 720 - 360),
  size: 14 + Math.round(rand(i + 121) * 16),
  drift: Math.round(rand(i + 151) * 120 - 60),
}));

/** Light confetti made from the club's own answer shapes (CSS-only motion). */
function Confetti() {
  return (
    <span className="confetti" aria-hidden="true">
      {PIECES.map((p, i) => (
        <span
          key={i}
          className="confetti__piece"
          data-choice={i % club.choices.length}
          style={
            {
              "--x": `${p.x}%`,
              "--delay": `${p.delay}ms`,
              "--dur": `${p.dur}ms`,
              "--spin": `${p.spin}deg`,
              "--size": `${p.size}px`,
              "--drift": `${p.drift}px`,
            } as CSSProperties
          }
        >
          <ChoiceShape index={i % club.choices.length} />
        </span>
      ))}
    </span>
  );
}

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
