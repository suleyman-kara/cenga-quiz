import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { club } from "../club.config";
import { ChoiceButton } from "./ChoiceButton";
import { ChoiceShape } from "./ChoiceShape";

describe("<ChoiceShape>", () => {
  it("renders the club's svg path for the index", () => {
    const { container } = render(<ChoiceShape index={2} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe(club.choices[2].viewBox);
    expect(container.querySelector("path")!.getAttribute("d")).toBe(club.choices[2].svgPath);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("<ChoiceButton>", () => {
  it("renders the club shape and an aria-label from the choice label", () => {
    const { container } = render(<ChoiceButton index={1} text="Ankara" onSelect={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAccessibleName(new RegExp(club.choices[1].label[club.locale]));
    expect(btn).toHaveAccessibleName(/Ankara/);
    expect(container.querySelector("path")!.getAttribute("d")).toBe(club.choices[1].svgPath);
  });

  it("calls onSelect once with its index, even when tapped repeatedly", async () => {
    const onSelect = vi.fn();
    render(<ChoiceButton index={3} text="X" onSelect={onSelect} />);
    const btn = screen.getByRole("button");
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("is disabled when told so and does not call onSelect", async () => {
    const onSelect = vi.fn();
    render(<ChoiceButton index={0} text="X" onSelect={onSelect} disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
