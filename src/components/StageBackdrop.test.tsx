import { describe, it, expect, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { StageBackdrop } from "./StageBackdrop";
import { mockReducedMotion, restoreMatchMedia } from "../test/reducedMotion";
import { club } from "../club.config";

afterEach(restoreMatchMedia);

describe("<StageBackdrop>", () => {
  it("is decorative: one soft blob per choice colour plus a few floating shapes", () => {
    const { container } = render(<StageBackdrop phase="lobby" />);
    const root = container.querySelector(".stage-backdrop")!;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveAttribute("data-phase", "lobby");
    expect(root.querySelectorAll(".stage-backdrop__blob")).toHaveLength(club.choices.length);
    expect(root.querySelectorAll(".stage-backdrop__shape").length).toBeGreaterThan(0);
    // stays cheap on a projector laptop
    expect(root.querySelectorAll("[data-choice]").length).toBeLessThanOrEqual(16);
  });

  it("switches to a still (non-animated) variant under reduced motion, keeping the colours", () => {
    const mq = mockReducedMotion(false);
    const { container } = render(<StageBackdrop phase="question" />);
    const root = () => container.querySelector(".stage-backdrop")!;
    expect(root()).not.toHaveClass("stage-backdrop--still");
    act(() => mq.set(true));
    expect(root()).toHaveClass("stage-backdrop--still");
    expect(root().querySelectorAll(".stage-backdrop__blob")).toHaveLength(club.choices.length);
  });
});
