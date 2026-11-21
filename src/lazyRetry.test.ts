import { describe, it, expect, vi, beforeEach } from "vitest";
import { importWithReload, isChunkLoadError } from "./lazyRetry";

const chunkError = () => new TypeError("Failed to fetch dynamically imported module: https://x/assets/HostGame-abc.js");

function fakeEnv(now = 100_000) {
  const store = new Map<string, string>();
  return {
    reload: vi.fn(),
    now: () => now,
    storage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
    store,
  };
}

describe("isChunkLoadError", () => {
  it("recognises failed dynamic imports across browsers", () => {
    expect(isChunkLoadError(chunkError())).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("something else"))).toBe(false);
    expect(isChunkLoadError("nope")).toBe(false);
  });
});

describe("importWithReload", () => {
  let env: ReturnType<typeof fakeEnv>;
  beforeEach(() => {
    env = fakeEnv();
  });

  it("returns the module when the import works", async () => {
    await expect(importWithReload(() => Promise.resolve({ ok: 1 }), env)).resolves.toEqual({ ok: 1 });
    expect(env.reload).not.toHaveBeenCalled();
  });

  it("reloads the page once when a chunk is missing after a deploy", async () => {
    const p = importWithReload(() => Promise.reject(chunkError()), env);
    // never resolves (the page is reloading), so race it
    const settled = await Promise.race([p.then(() => "settled", () => "rejected"), new Promise((r) => setTimeout(() => r("pending"), 20))]);
    expect(settled).toBe("pending");
    expect(env.reload).toHaveBeenCalledTimes(1);
  });

  it("does not loop: a second failure right after a reload is rethrown", async () => {
    env.storage.setItem("chunk-reload-at", String(env.now() - 5_000));
    await expect(importWithReload(() => Promise.reject(chunkError()), env)).rejects.toThrow(/dynamically imported/);
    expect(env.reload).not.toHaveBeenCalled();
  });

  it("reloads again if the last reload was long ago", async () => {
    env.storage.setItem("chunk-reload-at", String(env.now() - 60_000));
    void importWithReload(() => Promise.reject(chunkError()), env);
    await new Promise((r) => setTimeout(r, 0));
    expect(env.reload).toHaveBeenCalledTimes(1);
  });

  it("other errors are rethrown without reloading", async () => {
    await expect(importWithReload(() => Promise.reject(new Error("boom")), env)).rejects.toThrow("boom");
    expect(env.reload).not.toHaveBeenCalled();
  });
});
