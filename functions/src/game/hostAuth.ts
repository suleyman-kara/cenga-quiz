import { GameError } from "../core/errors";
import { requireSignedIn, requireVerifiedEmail, type AuthLike } from "../core/auth";
import { firestore } from "./firebase";

export const HOST_CACHE_TTL_MS = 60_000;

/**
 * Per-instance cache of allowedHosts answers (positive AND negative) for `ttlMs`: a warm instance
 * does not re-read Firestore on every click, and a refused caller cannot make us read it on every
 * call. Adding/removing a host therefore takes up to `ttlMs` to apply. Failed lookups are not cached.
 */
export function createHostCheck(
  lookup: (email: string) => Promise<boolean>,
  ttlMs = HOST_CACHE_TTL_MS,
  clock: () => number = Date.now,
  maxEntries = 1000,
) {
  const cache = new Map<string, { ok: boolean; at: number }>();
  return {
    async isAllowed(email: string): Promise<boolean> {
      const hit = cache.get(email);
      if (hit && clock() - hit.at <= ttlMs) return hit.ok;
      const ok = await lookup(email);
      if (cache.size >= maxEntries) cache.clear();
      cache.set(email, { ok, at: clock() });
      return ok;
    },
    clear: () => cache.clear(),
    size: () => cache.size,
  };
}

export const hostCheck = createHostCheck(
  async (email) => (await (await firestore()).doc(`allowedHosts/${email}`).get()).exists,
);

/** Synchronous, I/O-free part: signed in with a verified e-mail. Returns uid + normalized e-mail. */
export function requireHostIdentity(auth: AuthLike | undefined): { uid: string; email: string } {
  const uid = requireSignedIn(auth);
  return { uid, email: requireVerifiedEmail(auth!) };
}

/** Caller must be signed in with a verified e-mail listed in allowedHosts. Returns the uid. */
export async function requireAllowedHost(auth: AuthLike | undefined): Promise<string> {
  const { uid, email } = requireHostIdentity(auth);
  if (!(await hostCheck.isAllowed(email))) {
    throw new GameError("permission-denied", "Bu hesap oyun sunmak için yetkili değil.");
  }
  return uid;
}
