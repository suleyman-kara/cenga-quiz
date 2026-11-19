import { describe, it, expect } from "vitest";
import { LOCK_STALE_MS, isLockActive, lockState, ownsLock, unlockState } from "./lock";
import { GameError } from "./errors";
import type { GameState } from "../../../shared/types";

const base: GameState = { phase: "question", qIndex: 0, startedAt: 1, endsAt: 2, updatedAt: 3 };

describe("state lock", () => {
  it("isLockActive: absent or stale locks are inactive", () => {
    expect(isLockActive(undefined, 10)).toBe(false);
    expect(isLockActive({ by: "reveal", at: 1000 }, 1000 + LOCK_STALE_MS)).toBe(true);
    expect(isLockActive({ by: "reveal", at: 1000 }, 1001 + LOCK_STALE_MS)).toBe(false);
  });

  it("lockState adds a lock without touching the rest of the state", () => {
    const out = lockState(base, "reveal", 5000);
    expect(out).toEqual({ ...base, lock: { by: "reveal", at: 5000 } });
    expect(base.lock).toBeUndefined();
  });

  it("lockState refuses while another action holds a fresh lock", () => {
    const locked = lockState(base, "reveal", 5000);
    const err = (() => {
      try {
        lockState(locked, "end", 6000);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(GameError);
    expect((err as GameError).code).toBe("failed-precondition");
  });

  it("a stale lock (crashed call) can be overridden", () => {
    const locked = lockState(base, "reveal", 5000);
    expect(lockState(locked, "end", 5001 + LOCK_STALE_MS).lock).toEqual({ by: "end", at: 5001 + LOCK_STALE_MS });
  });

  it("ownsLock / unlockState only release our own lock", () => {
    const mine = { by: "reveal" as const, at: 5000 };
    const locked = lockState(base, "reveal", 5000);
    expect(ownsLock(locked, mine)).toBe(true);
    expect(ownsLock(locked, { by: "reveal", at: 4999 })).toBe(false);
    expect(unlockState(locked, mine)).toEqual(base);
    const theirs = lockState(base, "end", 7000);
    expect(unlockState(theirs, mine)).toBe(theirs);
  });
});
