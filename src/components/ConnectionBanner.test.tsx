import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionBanner } from "./ConnectionBanner";

describe("ConnectionBanner", () => {
  it("is a single polite status region (does not interrupt on every flap)", () => {
    render(<ConnectionBanner offline />);
    const banner = screen.getByRole("status");
    expect(banner).not.toHaveAttribute("aria-live", "assertive");
  });

  it("renders nothing while connected", () => {
    const { container } = render(<ConnectionBanner offline={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
