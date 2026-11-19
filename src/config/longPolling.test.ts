import { describe, it, expect, beforeEach } from "vitest";
import { wantsLongPolling } from "./longPolling";

describe("wantsLongPolling", () => {
  beforeEach(() => localStorage.clear());

  it("is off by default", () => {
    expect(wantsLongPolling("")).toBe(false);
  });

  it("?lp=1 turns it on and remembers it for later page loads", () => {
    expect(wantsLongPolling("?pin=123456&lp=1")).toBe(true);
    expect(wantsLongPolling("")).toBe(true);
  });

  it("?lp=0 turns it off again", () => {
    wantsLongPolling("?lp=1");
    expect(wantsLongPolling("?lp=0")).toBe(false);
    expect(wantsLongPolling("")).toBe(false);
  });
});
