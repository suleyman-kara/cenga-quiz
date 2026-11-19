import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWakeLock } from "./useWakeLock";

function fakeWakeLock() {
  const sentinels: { release: ReturnType<typeof vi.fn>; onrelease: (() => void) | null; released: boolean }[] = [];
  const request = vi.fn(async () => {
    const s = {
      released: false,
      onrelease: null as (() => void) | null,
      release: vi.fn(async () => {
        s.released = true;
      }),
      addEventListener: (_: string, cb: () => void) => {
        s.onrelease = cb;
      },
    };
    sentinels.push(s);
    return s;
  });
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  return { request, sentinels };
}

afterEach(() => {
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
});

describe("useWakeLock", () => {
  it("is a no-op without browser support", () => {
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current).toBe(false);
  });

  it("requests a screen lock and releases it on unmount", async () => {
    const { request, sentinels } = fakeWakeLock();
    const { result, unmount } = renderHook(() => useWakeLock(true));
    await act(async () => {});
    expect(request).toHaveBeenCalledWith("screen");
    expect(result.current).toBe(true);
    unmount();
    expect(sentinels[0].release).toHaveBeenCalled();
  });

  it("re-acquires when the page becomes visible again after the browser released it", async () => {
    const { request, sentinels } = fakeWakeLock();
    const { result } = renderHook(() => useWakeLock(true));
    await act(async () => {});
    await act(async () => sentinels[0].onrelease?.());
    expect(result.current).toBe(false);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(true);
  });

  it("does nothing while inactive", async () => {
    const { request } = fakeWakeLock();
    renderHook(() => useWakeLock(false));
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
  });
});
