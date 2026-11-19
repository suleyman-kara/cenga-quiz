/** Lazy Admin SDK handles: nothing heavy is loaded until a function actually needs it. */
import { getApps, initializeApp, type App } from "firebase-admin/app";
import type { Database } from "firebase-admin/database";
import type { Firestore } from "firebase-admin/firestore";

function app(): App {
  // In the emulator / on Cloud Functions FIREBASE_CONFIG supplies projectId + databaseURL.
  return getApps().find((a) => a.name === "[DEFAULT]") ?? initializeApp();
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
