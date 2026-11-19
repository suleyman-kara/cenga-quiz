import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { createReconnectWatchdog } from "./watchdog";

describe("createReconnectWatchdog", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setVisible = () => Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });

  it("kicks the connection if still offline 3 s after the tab becomes visible", () => {
    let connected = false;
    const reconnect = vi.fn();
    const stop = createReconnectWatchdog({ isConnected: () => connected, reconnect });
    setVisible();
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(2_999);
    expect(reconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reconnect).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does nothing when the connection came back by itself", () => {
    let connected = false;
    const reconnect = vi.fn();
    const stop = createReconnectWatchdog({ isConnected: () => connected, reconnect });
    setVisible();
    document.dispatchEvent(new Event("visibilitychange"));
    connected = true;
    vi.advanceTimersByTime(5_000);
    expect(reconnect).not.toHaveBeenCalled();
    stop();
  });

  it("also reacts to a page restored from the back/forward cache, but not to a normal pageshow", () => {
    const reconnect = vi.fn();
    const stop = createReconnectWatchdog({ isConnected: () => false, reconnect });
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
    vi.advanceTimersByTime(5_000);
    expect(reconnect).not.toHaveBeenCalled();
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    vi.advanceTimersByTime(3_000);
    expect(reconnect).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stop() removes the listeners and pending timers", () => {
    const reconnect = vi.fn();
    const stop = createReconnectWatchdog({ isConnected: () => false, reconnect });
    setVisible();
    document.dispatchEvent(new Event("visibilitychange"));
    stop();
    vi.advanceTimersByTime(5_000);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(5_000);
    expect(reconnect).not.toHaveBeenCalled();
  });
});
