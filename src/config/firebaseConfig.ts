import type { FirebaseOptions } from "firebase/app";

/** The subset of import.meta.env the Firebase bootstrap reads (pure, so it can be unit-tested). */
export interface ClientEnv {
  DEV: boolean;
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_DATABASE_URL?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_USE_EMULATORS?: string;
}

export const DEMO_PROJECT = "demo-club-quiz";

/** Emulator connection details; passed in only from dev code so production bundles never contain them. */
export interface EmulatorSetup {
  options: FirebaseOptions;
  host: string;
  ports: { auth: number; database: number; functions: number; firestore: number };
}

export const EMULATORS: EmulatorSetup = {
  options: {
    apiKey: "demo-key",
    projectId: DEMO_PROJECT,
    authDomain: `${DEMO_PROJECT}.firebaseapp.com`,
    databaseURL: `http://127.0.0.1:9000?ns=${DEMO_PROJECT}-default-rtdb`,
    appId: "demo-app",
  },
  host: "127.0.0.1",
  ports: { auth: 9099, database: 9000, functions: 5001, firestore: 8080 },
};

const REQUIRED = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_DATABASE_URL",
  "VITE_FIREBASE_APP_ID",
] as const;

/** Thrown when the real Firebase project is not configured; rendered as a friendly screen. */
export class ConfigError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Firebase configuration missing: ${missing.join(", ")}`);
    this.name = "ConfigError";
    this.missing = missing;
  }
}

export interface ResolvedConfig {
  useEmulators: boolean;
  options: FirebaseOptions;
}

/**
 * Emulators ONLY in a dev server (`vite`), and only when asked for or when no project is set.
 * A production build never talks to 127.0.0.1: with missing config it throws instead.
 */
export function resolveFirebaseConfig(env: ClientEnv, emulators?: EmulatorSetup): ResolvedConfig {
  const useEmulators =
    !!emulators && env.DEV === true && (env.VITE_USE_EMULATORS === "true" || !env.VITE_FIREBASE_PROJECT_ID);
  if (useEmulators) return { useEmulators, options: emulators.options };
  const missing = REQUIRED.filter((k) => !env[k]?.trim());
  if (missing.length) throw new ConfigError([...missing]);
  return {
    useEmulators: false,
    options: {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      databaseURL: env.VITE_FIREBASE_DATABASE_URL,
      appId: env.VITE_FIREBASE_APP_ID,
    },
  };
}
