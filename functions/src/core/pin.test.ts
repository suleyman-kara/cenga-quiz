import { describe, it, expect, vi } from "vitest";
import { allocatePin } from "./pin";
import { GameError } from "./errors";

describe("allocatePin", () => {
  it("returns the first PIN that can be claimed", async () => {
    const claim = vi.fn(async () => true);
    await expect(allocatePin(claim, () => "123456")).resolves.toBe("123456");
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it("retries on collisions with freshly generated PINs", async () => {
    const taken = new Set(["111111", "222222"]);
    const pins = ["111111", "222222", "333333"];
    const gen = vi.fn(() => pins.shift()!);
    const claim = vi.fn(async (p: string) => !taken.has(p));
    await expect(allocatePin(claim, gen)).resolves.toBe("333333");
    expect(claim.mock.calls.map((c) => c[0])).toEqual(["111111", "222222", "333333"]);
  });

  it("gives up after maxAttempts collisions with a resource-exhausted error", async () => {
    const claim = vi.fn(async () => false);
    const err = await allocatePin(claim, () => "123456", 10).catch((e) => e);
    expect(err).toBeInstanceOf(GameError);
    expect(err.code).toBe("resource-exhausted");
    expect(claim).toHaveBeenCalledTimes(10);
  });

  it("propagates claim failures", async () => {
    const claim = vi.fn(async () => {
      throw new Error("db down");
    });
    await expect(allocatePin(claim, () => "123456")).rejects.toThrow("db down");
  });
});
