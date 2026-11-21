import { GameError } from "../core/errors";
import { normalizeEmail } from "../core/auth";
import type { CheckHostEmailResponse } from "../../../shared/types";

/** RFC 5321 path limit; anything longer cannot be a real address. */
export const MAX_EMAIL_LENGTH = 254;

/** Basic shape only: one "@", no whitespace or slashes (the address becomes a Firestore doc id), a dotted domain. */
const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

/** `{ email }` → trimmed, lowercased address; throws invalid-argument for anything else. */
export function parseHostEmail(data: unknown): string {
  const raw = data && typeof data === "object" ? (data as Record<string, unknown>).email : undefined;
  if (typeof raw !== "string") throw new GameError("invalid-argument", "Geçerli bir e-posta adresi gönderin.");
  const email = normalizeEmail(raw);
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    throw new GameError("invalid-argument", "Geçerli bir e-posta adresi gönderin.");
  }
  return email;
}

/**
 * Sign-up pre-check for the host panel: answers only "is this one address on the allow-list?".
 * A UX gate so non-hosts are not asked to create an account; the security boundary stays in the
 * Firestore rules and the `host` callable (verified e-mail + allowedHosts). Works for signed-out callers.
 */
export function createCheckHostEmail(isAllowed: (email: string) => Promise<boolean>) {
  return async (data: unknown): Promise<CheckHostEmailResponse> => {
    const email = parseHostEmail(data);
    return { allowed: Boolean(await isAllowed(email)) };
  };
}
