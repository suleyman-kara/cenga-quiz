import { useRef } from "react";
import { club } from "../club.config";
import { ChoiceShape } from "./ChoiceShape";

interface Props {
  index: number;
  text: string;
  onSelect: (index: number) => void;
  disabled?: boolean;
  /** this is the option the player picked */
  selected?: boolean;
}

/**
 * Large tappable option: club color + club shape. Fires onSelect at most once, on the first
 * pointerdown (fast taps on phones) or click (keyboard). Remount (change `key`) to allow a retry.
 */
export function ChoiceButton({ index, text, onSelect, disabled = false, selected = false }: Props) {
  const fired = useRef(false);
  const choice = club.choices[index % club.choices.length];
  const label = `${choice.label[club.locale]}: ${text}`;
  const fire = () => {
    if (fired.current || disabled) return;
    fired.current = true;
    onSelect(index);
  };
  return (
    <button
      type="button"
      className="choice-btn"
      data-choice={index}
      data-selected={selected || undefined}
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button === 0) fire();
      }}
      onClick={fire}
    >
      <ChoiceShape index={index} />
      <span className="choice-btn__text">{text}</span>
    </button>
  );
}
