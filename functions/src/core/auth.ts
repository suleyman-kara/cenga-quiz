import { isValidPin } from "../../../shared/pin";
import { GameError } from "./errors";

/** Minimal shape of a callable request's `auth`. */
export interface AuthLike {
  uid: string;
  token: { email?: string; email_verified?: boolean; [k: string]: unknown };
}

export function requireSignedIn(auth: AuthLike | undefined): string {
  if (!auth?.uid) throw new GameError("unauthenticated", "Giriş yapmalısınız.");
  return auth.uid;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Returns the normalized e-mail of a signed-in user with a verified address. */
export function requireVerifiedEmail(auth: AuthLike): string {
  const { email, email_verified } = auth.token;
  if (typeof email !== "string" || email.trim() === "" || email_verified !== true) {
    throw new GameError("permission-denied", "Bu işlem için doğrulanmış bir e-posta ile giriş yapmalısınız.");
  }
  return normalizeEmail(email);
}

function field(data: unknown, key: string): unknown {
  return data && typeof data === "object" ? (data as Record<string, unknown>)[key] : undefined;
}

export function parsePin(data: unknown): string {
  const pin = field(data, "pin");
  if (!isValidPin(pin)) throw new GameError("invalid-argument", "Geçersiz PIN.");
  return pin;
}

export function parseQuizId(data: unknown): string {
  const id = field(data, "quizId");
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new GameError("invalid-argument", "Geçersiz quiz kimliği.");
  }
  return id;
}

/** A Firebase Auth uid usable as an RTDB key. */
export function parseUid(data: unknown): string {
  const uid = field(data, "uid");
  if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    throw new GameError("invalid-argument", "Geçersiz oyuncu kimliği.");
  }
  return uid;
}

export function parseBool(data: unknown, key: string): boolean {
  const v = field(data, key);
  if (typeof v !== "boolean") throw new GameError("invalid-argument", `Geçersiz değer: ${key}.`);
  return v;
}

/** Expected current question index for idempotent host steps. */
export function parseQIndex(data: unknown): number {
  const q = field(data, "qIndex");
  if (typeof q !== "number" || !Number.isInteger(q) || q < 0 || q > 10_000) {
    throw new GameError("invalid-argument", "Geçersiz soru sırası (qIndex).");
  }
  return q;
}
