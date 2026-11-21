import type { CSSProperties } from "react";
import { club } from "../club.config";
import { useReducedMotion } from "../theme/motion";
import { ChoiceShape } from "./ChoiceShape";

/** Deterministic pseudo-random in [0,1) so confetti looks scattered but renders the same every time. */
const rand = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export interface ConfettiPiece {
  /** left, % of the viewport */
  x: number;
  delay: number;
  dur: number;
  spin: number;
  size: number;
  drift: number;
}

/** Pure: the scattered pieces (same input → same pieces). */
export function confettiPieces(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    x: Math.round(rand(i + 1) * 100),
    delay: Math.round(rand(i + 31) * 1400),
    dur: 2600 + Math.round(rand(i + 61) * 1800),
    spin: Math.round(rand(i + 91) * 720 - 360),
    size: 14 + Math.round(rand(i + 121) * 16),
    drift: Math.round(rand(i + 151) * 120 - 60),
  }));
}

interface Props {
  /** number of falling shapes (keep it to a few dozen) */
  count?: number;
  /** delay before the first piece falls; CSS falls back to the podium timing when omitted */
  startMs?: number;
  /** how many times each piece falls; CSS default 3 */
  loops?: number;
  className?: string;
}

/**
 * Light confetti made from the club's own answer shapes (CSS-only motion, transform/opacity).
 * Not rendered at all when the user prefers reduced motion.
 */
export function Confetti({ count = 28, startMs, loops, className }: Props) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  const style: Record<string, string> = {};
  if (startMs !== undefined) style["--start"] = `${startMs}ms`;
  if (loops !== undefined) style["--loops"] = String(loops);
  return (
    <span
      className={["confetti", className].filter(Boolean).join(" ")}
      aria-hidden="true"
      style={style as CSSProperties}
    >
      {confettiPieces(count).map((p, i) => (
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
