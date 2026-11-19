import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { club } from "../club.config";
import { Logo } from "./Logo";

describe("<Logo>", () => {
  it("takes src and alt text from the club config", () => {
    render(<Logo />);
    const img = screen.getByAltText(club.logo.alt);
    expect(img).toHaveAttribute("src", club.logo.src);
  });
});
