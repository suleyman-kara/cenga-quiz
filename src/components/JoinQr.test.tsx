import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JoinQr, joinUrl, qrModules } from "./JoinQr";
import { t } from "../i18n";

describe("joinUrl", () => {
  it("points at the join page with the PIN prefilled", () => {
    expect(joinUrl("https://kulup-quiz.web.app", "123456")).toBe("https://kulup-quiz.web.app/?pin=123456");
  });

  it("ignores a trailing slash on the origin", () => {
    expect(joinUrl("http://127.0.0.1:5173/", "654321")).toBe("http://127.0.0.1:5173/?pin=654321");
  });
});

describe("qrModules", () => {
  it("returns a square module grid with the three finder patterns", () => {
    const { size, dark } = qrModules("https://kulup-quiz.web.app/?pin=123456");
    expect(size).toBeGreaterThanOrEqual(21);
    expect((size - 17) % 4).toBe(0);
    // finder pattern corners are dark
    expect(dark(0, 0)).toBe(true);
    expect(dark(0, size - 1)).toBe(true);
    expect(dark(size - 1, 0)).toBe(true);
  });
});

describe("JoinQr", () => {
  it("renders an accessible SVG for the join URL", () => {
    render(<JoinQr url="https://kulup-quiz.web.app/?pin=123456" />);
    const img = screen.getByRole("img", { name: t("hostGame.qrLabel") });
    expect(img.tagName.toLowerCase()).toBe("svg");
    expect(img.querySelector("path")?.getAttribute("d")).toMatch(/^M/);
    expect(img.getAttribute("data-url")).toBe("https://kulup-quiz.web.app/?pin=123456");
  });
});
