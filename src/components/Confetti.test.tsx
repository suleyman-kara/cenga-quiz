import { describe, it, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { Confetti, confettiPieces } from "./Confetti";
import { mockReducedMotion, restoreMatchMedia } from "../test/reducedMotion";

afterEach(restoreMatchMedia);

describe("confettiPieces", () => {
  it("is deterministic and keeps pieces on screen", () => {
    const a = confettiPieces(20);
    expect(a).toEqual(confettiPieces(20));
    expect(a).toHaveLength(20);
    for (const p of a) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.size).toBeGreaterThan(0);
    }
  });
});

describe("<Confetti>", () => {
  it("renders the requested number of decorative shape pieces", () => {
    const { container } = render(<Confetti count={12} />);
    const root = container.querySelector(".confetti");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".confetti__piece")).toHaveLength(12);
  });

  it("passes start delay and loop count to CSS", () => {
    const { container } = render(<Confetti count={3} startMs={700} loops={1} className="confetti--reveal" />);
    const root = container.querySelector<HTMLElement>(".confetti")!;
    expect(root).toHaveClass("confetti--reveal");
    expect(root.style.getPropertyValue("--start")).toBe("700ms");
    expect(root.style.getPropertyValue("--loops")).toBe("1");
  });

  it("renders nothing when the user prefers reduced motion", () => {
    mockReducedMotion(true);
    const { container } = render(<Confetti count={12} />);
    expect(container.querySelector(".confetti")).toBeNull();
  });
});
