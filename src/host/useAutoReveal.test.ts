import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { revealDue, useAutoReveal } from "./useAutoReveal";

const fp = () => Object.assign(new Error("Süre dolmadan"), { code: "functions/failed-precondition" });

describe("revealDue", () => {
  it("is due 300 ms after endsAt on the server clock", () => {
    expect(revealDue({ endsAt: 20_000, now: 20_299, allAnswered: false })).toBe(false);
    expect(revealDue({ endsAt: 20_000, now: 20_300, allAnswered: false })).toBe(true);
  });
  it("is due when everybody answered", () => {
    expect(revealDue({ endsAt: 20_000, now: 5_000, allAnswered: true })).toBe(true);
  });
  it("never due without an end time", () => {
    expect(revealDue({ endsAt: 0, now: 5_000, allAnswered: false })).toBe(false);
  });
});

describe("useAutoReveal", () => {
  afterEach(() => vi.useRealTimers());

  it("auto-reveals once when due; {already:true} counts as success", async () => {
    const reveal = vi.fn().mockResolvedValue({ ok: true, already: true });
    const onError = vi.fn();
    const { result, rerender } = renderHook((p: { due: boolean }) =>
      useAutoReveal({ qIndex: 0, active: true, due: p.due, reveal, onError }), { initialProps: { due: false } });
    expect(reveal).not.toHaveBeenCalled();
    rerender({ due: true });
    await act(async () => {});
    rerender({ due: true });
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(result.current.sent).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it("retries failed-precondition up to 3 times with 1 s backoff", async () => {
    vi.useFakeTimers();
    const reveal = vi.fn().mockRejectedValue(fp());
    const onError = vi.fn();
    renderHook(() => useAutoReveal({ qIndex: 0, active: true, due: true, reveal, onError }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_500);
    });
    expect(reveal).toHaveBeenCalledTimes(4);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("after a final failure the button can retry manually; no automatic loop", async () => {
    const reveal = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ ok: true });
    const onError = vi.fn();
    const { result } = renderHook(() => useAutoReveal({ qIndex: 0, active: true, due: true, reveal, onError }));
    await act(async () => {});
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.sent).toBe(false);
    expect(reveal).toHaveBeenCalledTimes(1);
    await act(async () => result.current.reveal());
    expect(reveal).toHaveBeenCalledTimes(2);
  });

  it("manual reveal prevents a later auto call for the same question", async () => {
    const reveal = vi.fn().mockResolvedValue({ ok: true });
    const { result, rerender } = renderHook((p: { due: boolean }) =>
      useAutoReveal({ qIndex: 0, active: true, due: p.due, reveal }), { initialProps: { due: false } });
    await act(async () => result.current.reveal());
    rerender({ due: true });
    await act(async () => {});
    expect(reveal).toHaveBeenCalledTimes(1);
  });
});
