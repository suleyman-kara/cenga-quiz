import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const fb = vi.hoisted(() => {
  let connected: ((snap: { val(): unknown }) => void) | undefined;
  const disc = { remove: vi.fn(async () => {}), cancel: vi.fn(async () => {}) };
  return {
    disc,
    emit: (v: boolean) => connected?.({ val: () => v }),
    onValue: vi.fn((_r: unknown, cb: (snap: { val(): unknown }) => void) => {
      connected = cb;
      return vi.fn();
    }),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  };
});
vi.mock("../firebase", () => ({ db: {} }));
vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path: string) => path,
  onValue: fb.onValue,
  onDisconnect: () => fb.disc,
  set: fb.set,
  remove: fb.remove,
}));

import { useHostPresence } from "./presence";

describe("useHostPresence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("on every (re)connect: arms the server-side removal first, then marks the host online", async () => {
    renderHook(() => useHostPresence("123456", true));
    fb.emit(true);
    await vi.waitFor(() => expect(fb.set).toHaveBeenCalledWith("games/123456/hostOnline", true));
    expect(fb.disc.remove.mock.invocationCallOrder[0]).toBeLessThan(fb.set.mock.invocationCallOrder[0]);
    fb.emit(false);
    fb.emit(true);
    await vi.waitFor(() => expect(fb.set).toHaveBeenCalledTimes(2));
  });

  it("clears the flag when the screen leaves the game; does nothing while inactive", () => {
    const { rerender } = renderHook(({ on }) => useHostPresence("123456", on), { initialProps: { on: true } });
    rerender({ on: false });
    expect(fb.remove).toHaveBeenCalledWith("games/123456/hostOnline");
    expect(fb.disc.cancel).toHaveBeenCalled();
    vi.clearAllMocks();
    renderHook(() => useHostPresence("123456", false));
    expect(fb.onValue).not.toHaveBeenCalled();
  });
});
