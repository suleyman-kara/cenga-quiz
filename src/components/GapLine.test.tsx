import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GapLine } from "./GapLine";
import { emptyScore } from "../../shared/scoring";

describe("GapLine", () => {
  it("shows who is directly ahead and the gap", () => {
    render(<GapLine score={{ ...emptyScore(), rank: 4, aheadName: "Ayşe", aheadGap: 120 }} />);
    expect(screen.getByText("Önünde Ayşe var: 120 puan geridesin")).toBeInTheDocument();
  });

  it("shows the lead for the leader", () => {
    render(<GapLine score={{ ...emptyScore(), rank: 1, leadGap: 80 }} />);
    expect(screen.getByText("Liderdesin! 80 puan öndesin")).toBeInTheDocument();
  });

  it("renders nothing without gap info", () => {
    const { container } = render(<GapLine score={{ ...emptyScore(), rank: 1 }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
