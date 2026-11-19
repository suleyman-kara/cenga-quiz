import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Countdown, remaining, remainingSeconds } from "./Countdown";

describe("remaining(endsAt, serverNow)", () => {
  it("returns milliseconds left", () => {
    expect(remaining(10_000, 4_000)).toBe(6_000);
  });

  it("never goes below zero", () => {
    expect(remaining(10_000, 12_000)).toBe(0);
    expect(remaining(10_000, 10_000)).toBe(0);
  });

  it("treats a missing end time as zero", () => {
    expect(remaining(0, 5_000)).toBe(0);
  });
});

describe("remainingSeconds", () => {
  it("rounds up so the display shows 1 until time is really up", () => {
    expect(remainingSeconds(10_000, 9_001)).toBe(1);
    expect(remainingSeconds(10_000, 9_000)).toBe(1);
    expect(remainingSeconds(10_000, 8_999)).toBe(2);
    expect(remainingSeconds(10_000, 10_000)).toBe(0);
  });
});

describe("<Countdown>", () => {
  it("shows the remaining whole seconds as a timer", () => {
    render(<Countdown endsAt={20_000} totalSeconds={20} serverNow={7_500} />);
    expect(screen.getByRole("timer")).toHaveTextContent("13");
  });
});
