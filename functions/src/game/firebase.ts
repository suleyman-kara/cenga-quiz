/** Lazy Admin SDK handles: nothing heavy is loaded until a function actually needs it. */
import { getApps, initializeApp, type App, type AppOptions } from "firebase-admin/app";
import { defineString } from "firebase-functions/params";

/**
 * Realtime Database URL for a real project, e.g.
 * https://<project>-default-rtdb.europe-west1.firebasedatabase.app (regional instances are not
 * in the default FIREBASE_CONFIG). Empty → default config (emulator / us-central1 instance).
 */
export const DATABASE_URL = defineString("DATABASE_URL", {
  default: "",
  description: "RTDB URL, e.g. https://<project>-default-rtdb.europe-west1.firebasedatabase.app",
});

export function appOptions(databaseUrl: string): AppOptions | undefined {
  const url = databaseUrl.trim();
  return url ? { databaseURL: url } : undefined;
}
import type { Database } from "firebase-admin/database";
import type { Firestore } from "firebase-admin/firestore";

function app(): App {
  // In the emulator / on Cloud Functions FIREBASE_CONFIG supplies projectId + databaseURL.
  const existing = getApps().find((a) => a.name === "[DEFAULT]");
  if (existing) return existing;
  const opts = appOptions(DATABASE_URL.value());
  return opts ? initializeApp(opts) : initializeApp();
}

/**
 * For demo-* projects the Functions emulator hands out `https://<id>.firebaseio.com`
 * (namespace `<id>`), while clients use the default instance `<id>-default-rtdb`.
 * Point the Admin SDK at the same namespace as the clients.
 */
export function emulatorDatabaseURL(env: Record<string, string | undefined>): string | undefined {
  if (!env.FIREBASE_DATABASE_EMULATOR_HOST) return undefined;
  let projectId = env.GCLOUD_PROJECT;
  try {
    projectId = (JSON.parse(env.FIREBASE_CONFIG ?? "{}") as { projectId?: string }).projectId ?? projectId;
  } catch {
    // ignore malformed config
  }
  return projectId?.startsWith("demo-") ? `https://${projectId}-default-rtdb.firebaseio.com` : undefined;
}

let rtdb: Promise<Database> | undefined;
let fs: Promise<Firestore> | undefined;

export function database(): Promise<Database> {
  rtdb ??= import("firebase-admin/database").then((m) => {
    const url = emulatorDatabaseURL(process.env);
    return url ? m.getDatabaseWithUrl(url, app()) : m.getDatabase(app());
  });
  return rtdb;
}

export function firestore(): Promise<Firestore> {
  fs ??= import("firebase-admin/firestore").then((m) => m.getFirestore(app()));
  return fs;
}
