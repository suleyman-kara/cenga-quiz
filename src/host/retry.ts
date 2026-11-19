import { errorCode } from "../errors";

interface RetryOptions {
  retries: number;
  delayMs: number;
  /** checked before each retry; true stops (the last error is rethrown) */
  cancelled?: () => boolean;
}

/**
 * Retries a host action that failed with failed-precondition (lock held by another transition,
 * or the server clock not yet past endsAt). Safe because host actions are idempotent per qIndex.
 */
export async function withRetry<T>(fn: () => Promise<T>, { retries, delayMs, cancelled }: RetryOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || errorCode(err) !== "failed-precondition" || cancelled?.()) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
      if (cancelled?.()) throw err;
    }
  }
}
