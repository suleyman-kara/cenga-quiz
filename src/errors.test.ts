import { describe, it, expect } from "vitest";
import { errorCode, friendlyError, hostAuthError, isPermissionDenied } from "./errors";
import { translate } from "./i18n";
import { club } from "./club.config";

const t = (k: Parameters<typeof translate>[1]) => translate(club.locale, k);
const withCode = (code: string, message = "raw") => Object.assign(new Error(message), { code });

describe("errorCode", () => {
  it("normalizes Firebase codes from every SDK", () => {
    expect(errorCode(withCode("functions/failed-precondition"))).toBe("failed-precondition");
    expect(errorCode(withCode("auth/too-many-requests"))).toBe("auth/too-many-requests");
    expect(errorCode(withCode("PERMISSION_DENIED"))).toBe("permission-denied");
    expect(errorCode(withCode("permission-denied"))).toBe("permission-denied");
    expect(errorCode(new Error("PERMISSION_DENIED: Permission denied"))).toBe("permission-denied");
    expect(errorCode("nope")).toBe("unknown");
  });

  it("isPermissionDenied covers RTDB set() rejections", () => {
    expect(isPermissionDenied(withCode("PERMISSION_DENIED", "PERMISSION_DENIED: Permission denied"))).toBe(true);
    expect(isPermissionDenied(withCode("functions/internal"))).toBe(false);
  });
});

describe("friendlyError", () => {
  it("auth/too-many-requests suggests mobile data", () => {
    expect(friendlyError(withCode("auth/too-many-requests"))).toBe(t("errors.tooManyRequests"));
  });

  it("RTDB/Firestore permission denied", () => {
    expect(friendlyError(withCode("PERMISSION_DENIED"))).toBe(t("errors.permissionDenied"));
  });

  it("network problems", () => {
    expect(friendlyError(withCode("auth/network-request-failed"))).toBe(t("errors.network"));
    expect(friendlyError(withCode("functions/unavailable"))).toBe(t("errors.network"));
    expect(friendlyError(withCode("unavailable"))).toBe(t("errors.network"));
    expect(friendlyError(withCode("functions/deadline-exceeded"))).toBe(t("errors.network"));
  });

  it("uses the server's HttpsError message for failed-precondition / permission-denied", () => {
    expect(friendlyError(withCode("functions/failed-precondition", "Başka soru kalmadı."))).toBe("Başka soru kalmadı.");
    expect(friendlyError(withCode("functions/permission-denied", "Bu oyunun sunucusu değilsiniz."))).toBe(
      "Bu oyunun sunucusu değilsiniz.",
    );
  });

  it("other functions errors and unknown errors are generic (no raw internals)", () => {
    expect(friendlyError(withCode("functions/internal", "internal"))).toBe(t("errors.generic"));
    expect(friendlyError(new Error("TypeError: x is undefined"))).toBe(t("errors.generic"));
  });
});

describe("host sign-in errors", () => {
  it("explains an unauthorized domain", () => {
    expect(friendlyError(withCode("auth/unauthorized-domain"))).toBe(t("errors.unauthorizedDomain"));
  });
  it("maps email/password auth codes to friendly Turkish messages", () => {
    for (const c of ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-login-credentials"]) {
      expect(hostAuthError(withCode(c))).toBe(t("host.wrongCredentials"));
    }
    expect(hostAuthError(withCode("auth/email-already-in-use"))).toBe(t("host.emailInUse"));
    expect(hostAuthError(withCode("auth/weak-password"))).toBe(t("host.weakPassword"));
    expect(hostAuthError(withCode("auth/invalid-email"))).toBe(t("host.invalidEmail"));
    expect(hostAuthError(withCode("auth/too-many-requests"))).toBe(t("host.tooManyAttempts"));
    expect(hostAuthError(withCode("auth/network-request-failed"))).toBe(t("errors.network"));
    expect(hostAuthError(withCode("host/email-not-allowed"))).toBe(t("host.notAllowedEmail"));
    expect(hostAuthError(withCode("auth/user-disabled"))).toBe(t("host.userDisabled"));
    expect(hostAuthError(new Error("boom"))).toBe(t("errors.generic"));
  });
});
