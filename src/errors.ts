import { t } from "./i18n";

/**
 * Normalized Firebase error code: "functions/x" → "x", RTDB "PERMISSION_DENIED" → "permission-denied";
 * auth codes keep their "auth/" prefix.
 */
export function errorCode(err: unknown): string {
  if (!err || typeof err !== "object") return "unknown";
  const raw = (err as { code?: unknown }).code;
  const message = (err as { message?: unknown }).message;
  let code = typeof raw === "string" ? raw : "";
  if (!code && typeof message === "string" && message.startsWith("PERMISSION_DENIED")) code = "PERMISSION_DENIED";
  if (!code) return "unknown";
  if (code.startsWith("functions/")) code = code.slice("functions/".length);
  if (code === "PERMISSION_DENIED") return "permission-denied";
  return code;
}

export const isPermissionDenied = (err: unknown) => errorCode(err) === "permission-denied";
export const isFunctionsError = (err: unknown) =>
  typeof (err as { code?: unknown })?.code === "string" && (err as { code: string }).code.startsWith("functions/");

const NETWORK = new Set(["unavailable", "deadline-exceeded", "auth/network-request-failed", "auth/timeout"]);
/** Callable codes whose HttpsError message is written for people (Turkish, from functions/). */
const SERVER_MESSAGE = new Set(["failed-precondition", "permission-denied", "not-found", "resource-exhausted"]);

/** A message safe to show a player or host, in the club's locale. */
export function friendlyError(err: unknown): string {
  const code = errorCode(err);
  if (code === "auth/too-many-requests") return t("errors.tooManyRequests");
  if (NETWORK.has(code)) return t("errors.network");
  if (isFunctionsError(err) && SERVER_MESSAGE.has(code)) {
    const message = (err as Error).message;
    if (message && message !== code) return message;
  }
  if (code === "permission-denied") return t("errors.permissionDenied");
  return t("errors.generic");
}
