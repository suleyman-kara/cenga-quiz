import type { CSSProperties } from "react";
import type { GameState } from "../../shared/types";
import { club } from "../club.config";
import { useReducedMotion } from "../theme/motion";
import { ChoiceShape } from "./ChoiceShape";

/** Floating answer shapes: fixed positions/timings (deterministic, few elements). */
const SHAPES = [
  { x: 6, y: 18, size: 90, dur: 34, delay: -4 },
  { x: 88, y: 12, size: 70, dur: 40, delay: -18 },
  { x: 14, y: 78, size: 64, dur: 38, delay: -9 },
  { x: 74, y: 84, size: 96, dur: 44, delay: -27 },
  { x: 48, y: 6, size: 54, dur: 36, delay: -13 },
  { x: 94, y: 52, size: 60, dur: 42, delay: -31 },
  { x: 3, y: 50, size: 48, dur: 32, delay: -21 },
  { x: 58, y: 92, size: 52, dur: 39, delay: -6 },
];

/**
 * Lively but calm stage background: one soft, slowly drifting colour blob per answer colour plus
 * a few faint floating answer shapes. Pure decoration (aria-hidden), transform/opacity-only CSS
 * animation; under reduced motion it stays still but keeps its colours.
 */
export function StageBackdrop({ phase }: { phase?: GameState["phase"] }) {
  const reduced = useReducedMotion();
  return (
    <div
      className={["stage-backdrop", reduced && "stage-backdrop--still"].filter(Boolean).join(" ")}
      data-phase={phase}
      aria-hidden="true"
    >
      {club.choices.map((c, i) => (
        <span key={c.id} className="stage-backdrop__blob" data-choice={i} style={{ "--i": i } as CSSProperties} />
      ))}
      {SHAPES.map((s, i) => (
        <span
          key={i}
          className="stage-backdrop__shape"
          data-choice={i % club.choices.length}
          style={
            {
              "--x": `${s.x}%`,
              "--y": `${s.y}%`,
              "--size": `${s.size}px`,
              "--dur": `${s.dur}s`,
              "--delay": `${s.delay}s`,
            } as CSSProperties
          }
        >
          <ChoiceShape index={i % club.choices.length} />
        </span>
      ))}
    </div>
  );
}
