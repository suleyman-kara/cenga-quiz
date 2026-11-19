import { club } from "../club.config";

interface Props {
  index: number;
  className?: string;
}

/** The club's shape for option `index` (decorative; labels live on the button). */
export function ChoiceShape({ index, className }: Props) {
  const choice = club.choices[index % club.choices.length];
  return (
    <svg
      className={["choice-shape", className].filter(Boolean).join(" ")}
      viewBox={choice.viewBox}
      aria-hidden="true"
      focusable="false"
      data-shape={choice.id}
    >
      <path d={choice.svgPath} />
    </svg>
  );
}
