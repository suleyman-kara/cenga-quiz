import { describe, it, expect, vi, afterEach } from "vitest";
import { withRetry } from "./retry";

const fp = () => Object.assign(new Error("Başka bir işlem sürüyor"), { code: "functions/failed-precondition" });

describe("withRetry", () => {
  afterEach(() => vi.useRealTimers());

  it("resolves on first success without waiting", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });
    await expect(withRetry(fn, { retries: 3, delayMs: 1000 })).resolves.toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries failed-precondition with the given delay, up to `retries` times", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValueOnce(fp()).mockRejectedValueOnce(fp()).mockResolvedValue("done");
    const p = withRetry(fn, { retries: 3, delayMs: 1000 });
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBe("done");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up after `retries` and rejects with the last error", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValue(fp());
    const caught = withRetry<unknown>(fn, { retries: 3, delayMs: 1000 }).catch((e: unknown) => e as Error);
    await vi.advanceTimersByTimeAsync(5000);
    expect(((await caught) as Error).message).toMatch(/Başka/);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("does not retry other errors", async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { code: "functions/permission-denied" }));
    await expect(withRetry(fn, { retries: 3, delayMs: 10 })).rejects.toThrow("x");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops retrying once cancelled", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const fn = vi.fn().mockRejectedValue(fp());
    const p = withRetry(fn, { retries: 3, delayMs: 1000, cancelled: () => cancelled }).catch((e: Error) => e);
    cancelled = true;
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
