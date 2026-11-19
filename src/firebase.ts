import { initializeApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectDatabaseEmulator, getDatabase } from "firebase/database";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { FUNCTIONS_REGION, type CallableContract, type CallableName } from "../shared/types";

const env = import.meta.env;
const DEMO_PROJECT = "demo-club-quiz";

/** Emulators when explicitly requested, or in dev when no real project is configured. */
export const useEmulators =
  env.VITE_USE_EMULATORS === "true" || (env.DEV && !env.VITE_FIREBASE_PROJECT_ID);

const options: FirebaseOptions = useEmulators
  ? {
      apiKey: "demo-key",
      projectId: DEMO_PROJECT,
      authDomain: `${DEMO_PROJECT}.firebaseapp.com`,
      databaseURL: `http://127.0.0.1:9000?ns=${DEMO_PROJECT}-default-rtdb`,
      appId: "demo-app",
    }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      databaseURL: env.VITE_FIREBASE_DATABASE_URL,
      appId: env.VITE_FIREBASE_APP_ID,
    };

export const app = initializeApp(options);
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const db = getDatabase(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);

if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  connectDatabaseEmulator(db, "127.0.0.1", 9000);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

/** Typed wrapper around the HTTPS callables declared in shared/types.ts. */
export async function call<Name extends CallableName>(
  name: Name,
  req: CallableContract[Name]["req"],
): Promise<CallableContract[Name]["res"]> {
  const fn = httpsCallable<CallableContract[Name]["req"], CallableContract[Name]["res"]>(functions, name);
  const result = await fn(req);
  return result.data;
}
