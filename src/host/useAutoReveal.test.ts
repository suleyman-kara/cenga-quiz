import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { allPlayersAnswered, answeredCount, revealBackoffMs, revealDue, useAutoReveal } from "./useAutoReveal";

const fp = () => Object.assign(new Error("Süre dolmadan"), { code: "functions/failed-precondition" });
const unavailable = () => Object.assign(new Error("unavailable"), { code: "functions/unavailable" });

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

describe("allPlayersAnswered / answeredCount", () => {
  it("is true only when every current player uid has an answer", () => {
    expect(allPlayersAnswered(["a", "b"], ["a", "b"])).toBe(true);
    expect(allPlayersAnswered(["a", "b"], ["a"])).toBe(false);
  });
  it("ignores answers of kicked players (no longer in the player list)", () => {
    // 2 players, 2 answers — but one answer belongs to a kicked player
    expect(allPlayersAnswered(["a", "b"], ["a", "kicked"])).toBe(false);
    expect(answeredCount(["a", "b"], ["a", "kicked"])).toBe(1);
  });
  it("is false with no players", () => {
    expect(allPlayersAnswered([], ["x"])).toBe(false);
  });
});

describe("revealBackoffMs", () => {
  it("doubles from 1 s and caps at 10 s", () => {
    expect([1, 2, 3, 4, 5, 6].map(revealBackoffMs)).toEqual([1000, 2000, 4000, 8000, 10_000, 10_000]);
  });
});

describe("useAutoReveal", () => {
  afterEach(() => vi.useRealTimers());

  it("auto-reveals once when due; {already:true} counts as success", async () => {
    const reveal = vi.fn().mockResolvedValue({ ok: true, already: true });
    const onError = vi.fn();
    const { result, rerender } = renderHook(
      (p: { due: boolean }) => useAutoReveal({ qIndex: 0, active: true, due: p.due, reveal, onError }),
      { initialProps: { due: false } },
    );
    expect(reveal).not.toHaveBeenCalled();
    rerender({ due: true });
    await act(async () => {});
    rerender({ due: true });
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(result.current.sent).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps re-arming after any error with 1 s, 2 s, 4 s … backoff until it succeeds", async () => {
    vi.useFakeTimers();
    const reveal = vi
      .fn()
      .mockRejectedValueOnce(fp())
      .mockRejectedValueOnce(unavailable())
      .mockRejectedValueOnce(Object.assign(new Error("x"), { code: "functions/internal" }))
      .mockResolvedValue({ ok: true });
    const onError = vi.fn();
    const { result } = renderHook(() => useAutoReveal({ qIndex: 0, active: true, due: true, reveal, onError }));
    await act(async () => {});
    expect(reveal).toHaveBeenCalledTimes(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(999)));
    expect(reveal).toHaveBeenCalledTimes(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1)));
    expect(reveal).toHaveBeenCalledTimes(2);
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    expect(reveal).toHaveBeenCalledTimes(3);
    await act(async () => void (await vi.advanceTimersByTimeAsync(3999)));
    expect(reveal).toHaveBeenCalledTimes(3);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1)));
    expect(reveal).toHaveBeenCalledTimes(4);
    expect(result.current.sent).toBe(true);
    await act(async () => void (await vi.advanceTimersByTimeAsync(60_000)));
    expect(reveal).toHaveBeenCalledTimes(4);
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it("caps the backoff at 10 s", async () => {
    vi.useFakeTimers();
    const reveal = vi.fn().mockRejectedValue(unavailable());
    renderHook(() => useAutoReveal({ qIndex: 0, active: true, due: true, reveal }));
    await act(async () => {});
    for (const ms of [1000, 2000, 4000, 8000]) await act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
    expect(reveal).toHaveBeenCalledTimes(5);
    await act(async () => void (await vi.advanceTimersByTimeAsync(9_999)));
    expect(reveal).toHaveBeenCalledTimes(5);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1)));
    expect(reveal).toHaveBeenCalledTimes(6);
  });

  it("stops re-arming when the phase changes", async () => {
    vi.useFakeTimers();
    const reveal = vi.fn().mockRejectedValue(unavailable());
    const { rerender } = renderHook((p: { active: boolean }) => useAutoReveal({ qIndex: 0, active: p.active, due: true, reveal }), {
      initialProps: { active: true },
    });
    await act(async () => {});
    expect(reveal).toHaveBeenCalledTimes(1);
    rerender({ active: false });
    await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)));
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it("does not fire while paused (a host action is in flight) and re-evaluates once it clears", async () => {
    const reveal = vi.fn().mockResolvedValue({ ok: true });
    const { rerender } = renderHook(
      (p: { paused: boolean }) => useAutoReveal({ qIndex: 0, active: true, due: true, paused: p.paused, reveal }),
      { initialProps: { paused: true } },
    );
    await act(async () => {});
    expect(reveal).not.toHaveBeenCalled();
    rerender({ paused: false });
    await act(async () => {});
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it("after a failure the button can retry manually right away", async () => {
    vi.useFakeTimers();
    const reveal = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ ok: true });
    const onError = vi.fn();
    const { result } = renderHook(() => useAutoReveal({ qIndex: 0, active: true, due: true, reveal, onError }));
    await act(async () => {});
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.sent).toBe(false);
    await act(async () => result.current.reveal());
    expect(reveal).toHaveBeenCalledTimes(2);
    expect(result.current.sent).toBe(true);
    await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)));
    expect(reveal).toHaveBeenCalledTimes(2);
  });

  it("manual reveal prevents a later auto call for the same question", async () => {
    const reveal = vi.fn().mockResolvedValue({ ok: true });
    const { result, rerender } = renderHook(
      (p: { due: boolean }) => useAutoReveal({ qIndex: 0, active: true, due: p.due, reveal }),
      { initialProps: { due: false } },
    );
    await act(async () => result.current.reveal());
    rerender({ due: true });
    await act(async () => {});
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it("a new question starts fresh", async () => {
    const reveal = vi.fn().mockResolvedValue({ ok: true });
    const { rerender } = renderHook((p: { q: number }) => useAutoReveal({ qIndex: p.q, active: true, due: true, reveal }), {
      initialProps: { q: 0 },
    });
    await act(async () => {});
    rerender({ q: 1 });
    await act(async () => {});
    expect(reveal).toHaveBeenCalledTimes(2);
  });
});
