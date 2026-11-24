import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SESSION_TTL_MS, answeredChoice, clearSession, finishSession, loadLastSession, loadSession, markAnswered, saveSession } from "./session";

describe("player session storage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("round-trips pin and name per pin, in localStorage (survives closing the tab)", () => {
    expect(loadSession("123456")).toBeNull();
    saveSession({ pin: "123456", name: "Ali" });
    expect(loadSession("123456")).toEqual({ pin: "123456", name: "Ali" });
    expect(loadSession("654321")).toBeNull();
    expect(localStorage.getItem("quiz.session.123456")).not.toBeNull();
    expect(sessionStorage.length).toBe(0);
    clearSession("123456");
    expect(loadSession("123456")).toBeNull();
  });

  it("remembers the last game for a new tab", () => {
    saveSession({ pin: "111111", name: "A" });
    saveSession({ pin: "222222", name: "B" });
    expect(loadLastSession()).toEqual({ pin: "222222", name: "B" });
    clearSession("222222");
    expect(loadLastSession()).toBeNull();
  });

  it("expires old sessions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    saveSession({ pin: "123456", name: "Ali" });
    vi.setSystemTime(1_000_000 + SESSION_TTL_MS + 1);
    expect(loadSession("123456")).toBeNull();
    expect(loadLastSession()).toBeNull();
  });

  it("ignores corrupt data", () => {
    localStorage.setItem("quiz.session.123456", "{oops");
    expect(loadSession("123456")).toBeNull();
  });

  it("remembers the answered choice per pin and question; clearSession forgets them", () => {
    expect(answeredChoice("123456", 0)).toBeNull();
    markAnswered("123456", 0, 2);
    expect(answeredChoice("123456", 0)).toBe(2);
    expect(answeredChoice("123456", 1)).toBeNull();
    markAnswered("654321", 0, 1);
    clearSession("123456");
    expect(answeredChoice("123456", 0)).toBeNull();
    expect(answeredChoice("654321", 0)).toBe(1);
  });

  it("finishSession: a new tab no longer jumps to a finished game, but its own page still works", () => {
    saveSession({ pin: "111111", name: "Ali" });
    finishSession("111111");
    expect(loadLastSession()).toBeNull();
    expect(loadSession("111111")).toEqual({ pin: "111111", name: "Ali" });
  });

  it("finishSession leaves a newer game alone", () => {
    saveSession({ pin: "111111", name: "Ali" });
    saveSession({ pin: "222222", name: "Ali" });
    finishSession("111111");
    expect(loadLastSession()?.pin).toBe("222222");
  });
});

