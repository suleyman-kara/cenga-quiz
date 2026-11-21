import { describe, it, expect, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { prefersReducedMotion, useReducedMotion } from "./motion";
import { mockReducedMotion, restoreMatchMedia } from "../test/reducedMotion";

afterEach(restoreMatchMedia);

describe("prefersReducedMotion", () => {
  it("is false when matchMedia is unavailable (jsdom, old browsers)", () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it("follows the (prefers-reduced-motion: reduce) media query", () => {
    mockReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    mockReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("useReducedMotion", () => {
  it("updates when the user changes the OS setting, and unsubscribes on unmount", () => {
    const mq = mockReducedMotion(false);
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => mq.set(true));
    expect(result.current).toBe(true);
    unmount();
    expect(mq.listeners.size).toBe(0);
  });
});
