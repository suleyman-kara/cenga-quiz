import { describe, it, expect, beforeEach } from "vitest";
import { loadSession, saveSession, clearSession, markAnswered, answeredChoice } from "./session";

describe("player session storage", () => {
  beforeEach(() => sessionStorage.clear());

  it("round-trips pin and name", () => {
    expect(loadSession()).toBeNull();
    saveSession({ pin: "123456", name: "Ali" });
    expect(loadSession()).toEqual({ pin: "123456", name: "Ali" });
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it("ignores corrupt data", () => {
    sessionStorage.setItem("quiz.session", "{oops");
    expect(loadSession()).toBeNull();
  });

  it("remembers the answered choice per pin and question", () => {
    expect(answeredChoice("123456", 0)).toBeNull();
    markAnswered("123456", 0, 2);
    expect(answeredChoice("123456", 0)).toBe(2);
    expect(answeredChoice("123456", 1)).toBeNull();
  });
});
