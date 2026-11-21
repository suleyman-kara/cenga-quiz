import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectDatabaseEmulator, forceLongPolling, getDatabase } from "firebase/database";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import {
  CHECK_HOST_EMAIL_CALLABLE,
  FUNCTIONS_REGION,
  HOST_CALLABLE,
  type CheckHostEmailRequest,
  type CheckHostEmailResponse,
  type HostAction,
  type HostActionMap,
  type HostRequest,
  type HostResponse,
} from "../shared/types";
import { EMULATORS, resolveFirebaseConfig } from "./config/firebaseConfig";
import { wantsLongPolling } from "./config/longPolling";

/**
 * Firebase bootstrap. Firestore lives in ./firestore.ts so the player bundle does not load it.
 *
 * Emulators only in a dev server (see resolveFirebaseConfig). The `import.meta.env.DEV` checks are
 * static, so a production bundle contains neither the emulator addresses nor the connect calls.
 * A production build with missing config throws a ConfigError (main.tsx shows a friendly screen).
 */
const env = import.meta.env;
const config = import.meta.env.DEV
  ? resolveFirebaseConfig(env, EMULATORS)
  : resolveFirebaseConfig({ ...env, DEV: false });

export const useEmulators = config.useEmulators;
export const app = initializeApp(config.options);

// App Check must be active before the other services make requests. Loaded on demand so the
// player bundle stays lean when no site key is configured.
const siteKey = env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY?.trim();
if (siteKey) {
  if (import.meta.env.DEV && env.VITE_APP_CHECK_DEBUG_TOKEN) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      env.VITE_APP_CHECK_DEBUG_TOKEN;
  }
  try {
    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import("firebase/app-check");
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
  } catch (err) {
    // Without App Check the app still works while enforcement is off; never block the game on it.
    console.error("App Check could not start", err);
  }
}

// `?lp=1`: venue networks that block WebSockets can force long polling (must precede getDatabase).
if (typeof window !== "undefined" && wantsLongPolling(window.location.search)) forceLongPolling();

export const auth = getAuth(app);
export const db = getDatabase(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);

if (import.meta.env.DEV && useEmulators) {
  const { host, ports } = EMULATORS;
  connectAuthEmulator(auth, `http://${host}:${ports.auth}`, { disableWarnings: true });
  connectDatabaseEmulator(db, host, ports.database);
  connectFunctionsEmulator(functions, host, ports.functions);
}

const hostFn = httpsCallable<HostRequest, HostResponse>(functions, HOST_CALLABLE);

/** Typed wrapper around the single `host` dispatcher callable (see HostActionMap in shared/types.ts). */
export async function hostCall<A extends HostAction>(
  action: A,
  args: HostActionMap[A]["req"],
): Promise<HostActionMap[A]["res"]> {
  const result = await hostFn({ action, ...args } as HostRequest);
  return result.data as HostActionMap[A]["res"];
}

const checkHostEmailFn = httpsCallable<CheckHostEmailRequest, CheckHostEmailResponse>(functions, CHECK_HOST_EMAIL_CALLABLE);

/** Sign-up pre-check: is this one address on the host allow-list? (callable works signed out) */
export async function checkHostEmail(email: string): Promise<boolean> {
  const result = await checkHostEmailFn({ email });
  return result.data.allowed === true;
}
