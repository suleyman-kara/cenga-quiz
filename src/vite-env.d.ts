/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_DATABASE_URL?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** dev server only: "true" connects to the local emulators */
  readonly VITE_USE_EMULATORS?: string;
  /** enables App Check (reCAPTCHA Enterprise) when set */
  readonly VITE_RECAPTCHA_ENTERPRISE_SITE_KEY?: string;
  /** dev only: App Check debug token registered in Firebase Console */
  readonly VITE_APP_CHECK_DEBUG_TOKEN?: string;
}
