/**
 * After a new deploy, a page that was already open still references the previous build's
 * code-split chunks, which Hosting no longer serves: the next lazy screen fails with
 * "Failed to fetch dynamically imported module". Reload once to pick up the new build
 * (the game itself resumes from the server state); never loop.
 */
const KEY = "chunk-reload-at";
const LOOP_GUARD_MS = 10_000;

export function isChunkLoadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    err.message,
  );
}

interface Env {
  reload: () => void;
  now: () => number;
  storage: Pick<Storage, "getItem" | "setItem">;
}

function browserEnv(): Env {
  return {
    reload: () => window.location.reload(),
    now: () => Date.now(),
    storage: {
      getItem: (k) => {
        try {
          return sessionStorage.getItem(k);
        } catch {
          return null;
        }
      },
      setItem: (k, v) => {
        try {
          sessionStorage.setItem(k, v);
        } catch {
          /* storage blocked: the loop guard is best effort */
        }
      },
    },
  };
}

export function importWithReload<T>(load: () => Promise<T>, env: Env = browserEnv()): Promise<T> {
  return load().catch((err: unknown) => {
    if (!isChunkLoadError(err)) throw err;
    const last = Number(env.storage.getItem(KEY) ?? 0);
    if (env.now() - last < LOOP_GUARD_MS) throw err;
    env.storage.setItem(KEY, String(env.now()));
    env.reload();
    // keep the lazy boundary suspended while the page reloads
    return new Promise<T>(() => undefined);
  });
}
