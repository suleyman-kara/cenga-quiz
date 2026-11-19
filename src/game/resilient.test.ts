import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { subscribeWithRetry } from "./resilient";

/** A fake listener source: each subscribe() call is recorded so the test can emit / cancel it. */
function source() {
  const subs: { data: (v: number) => void; cancel: (e: Error) => void; unsub: ReturnType<typeof vi.fn> }[] = [];
  const subscribe = vi.fn((data: (v: number) => void, cancel: (e: Error) => void) => {
    const unsub = vi.fn();
    subs.push({ data, cancel, unsub });
    return unsub;
  });
  return { subs, subscribe, last: () => subs[subs.length - 1]! };
}
const denied = () => Object.assign(new Error("permission_denied"), { code: "PERMISSION_DENIED" });

describe("subscribeWithRetry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("passes values through", () => {
    const s = source();
    const onData = vi.fn();
    subscribeWithRetry({ subscribe: s.subscribe, onData, onTerminal: vi.fn(), beforeRetry: async () => {} });
    s.last().data(7);
    expect(onData).toHaveBeenCalledWith(7);
  });

  it("a cancelled listener is re-checked (auth) and re-subscribed with backoff, not treated as gone", async () => {
    const s = source();
    const onTerminal = vi.fn();
    const beforeRetry = vi.fn(async () => {});
    subscribeWithRetry({ subscribe: s.subscribe, onData: vi.fn(), onTerminal, beforeRetry });
    s.last().cancel(denied());
    expect(s.subs[0]!.unsub).toHaveBeenCalled();
    expect(s.subscribe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(s.subscribe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(beforeRetry).toHaveBeenCalledTimes(1);
    expect(s.subscribe).toHaveBeenCalledTimes(2);
    expect(onTerminal).not.toHaveBeenCalled();
  });

  it("gives up (terminal) only after 3 failed re-subscriptions", async () => {
    const s = source();
    const onTerminal = vi.fn();
    subscribeWithRetry({ subscribe: s.subscribe, onData: vi.fn(), onTerminal, beforeRetry: async () => {} });
    for (const ms of [1000, 2000, 4000]) {
      s.last().cancel(denied());
      await vi.advanceTimersByTimeAsync(ms);
    }
    expect(s.subscribe).toHaveBeenCalledTimes(4);
    expect(onTerminal).not.toHaveBeenCalled();
    s.last().cancel(denied());
    expect(onTerminal).toHaveBeenCalledTimes(1);
  });

  it("a value after a retry resets the budget", async () => {
    const s = source();
    const onTerminal = vi.fn();
    subscribeWithRetry({ subscribe: s.subscribe, onData: vi.fn(), onTerminal, beforeRetry: async () => {} });
    for (let round = 0; round < 3; round++) {
      s.last().cancel(denied());
      await vi.advanceTimersByTimeAsync(1000);
      s.last().data(round);
    }
    expect(onTerminal).not.toHaveBeenCalled();
  });

  it("stop() cancels a pending retry and unsubscribes", async () => {
    const s = source();
    const stop = subscribeWithRetry({ subscribe: s.subscribe, onData: vi.fn(), onTerminal: vi.fn(), beforeRetry: async () => {} });
    s.last().cancel(denied());
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.subscribe).toHaveBeenCalledTimes(1);
    const stop2 = subscribeWithRetry({ subscribe: s.subscribe, onData: vi.fn(), onTerminal: vi.fn(), beforeRetry: async () => {} });
    stop2();
    expect(s.last().unsub).toHaveBeenCalled();
  });
});
