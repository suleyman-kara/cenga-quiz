import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initializeTestEnvironment, type RulesTestEnvironment, type TokenOptions } from "@firebase/rules-unit-testing";
// NOTE: "@firebase/app" (not "firebase/app") on purpose — it is the instance that
// firebase/database and firebase/firestore register their components with. See report:
// the compat contexts of rules-unit-testing break when two @firebase/app copies are installed.
import { deleteApp, initializeApp, type FirebaseApp } from "@firebase/app";
import { connectDatabaseEmulator, get, getDatabase, ref, remove, set, update, type Database } from "firebase/database";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

export const PROJECT_ID = "demo-club-quiz";
const ROOT = join(__dirname, "..", "..");
const HOST = "127.0.0.1";
const DB_PORT = 9000;
const FS_PORT = 8080;
const STORAGE_PORT = 9199;

export const HOST_UID = "host-1";
export const HOST_EMAIL = "host@example.com";
export const hostToken = {
  email: HOST_EMAIL,
  email_verified: true,
  firebase: { sign_in_provider: "google.com" },
} as TokenOptions;
export const anonToken = { firebase: { sign_in_provider: "anonymous" } } as TokenOptions;

export function createEnv(kind: "database" | "firestore" | "storage"): Promise<RulesTestEnvironment> {
  if (kind === "storage") {
    // storage rules look up allowedHosts in Firestore (cross-service rules)
    return initializeTestEnvironment({
      projectId: PROJECT_ID,
      storage: { host: HOST, port: STORAGE_PORT, rules: readFileSync(join(ROOT, "rules/storage.rules"), "utf8") },
      firestore: { host: HOST, port: FS_PORT, rules: readFileSync(join(ROOT, "rules/firestore.rules"), "utf8") },
    });
  }
  if (kind === "database") {
    return initializeTestEnvironment({
      projectId: PROJECT_ID,
      database: { host: HOST, port: DB_PORT, rules: readFileSync(join(ROOT, "rules/database.rules.json"), "utf8") },
    });
  }
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: HOST, port: FS_PORT, rules: readFileSync(join(ROOT, "rules/firestore.rules"), "utf8") },
  });
}

/** Who the client is: a user (uid + token claims), the rules-bypassing "owner", or nobody. */
export type Who = { uid: string; token?: TokenOptions } | "owner" | null;

const apps: FirebaseApp[] = [];
let seq = 0;

function appFor(who: Who) {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: "fake-api-key" }, `rules-test-${++seq}`);
  apps.push(app);
  const mockUserToken =
    who === null ? undefined : who === "owner" ? "owner" : { ...who.token, sub: who.uid, user_id: who.uid };
  return { app, mockUserToken };
}

/** Modular RTDB client wrapped with a tiny `.ref(path).get/set/update/remove` facade. */
export function rtdbAs(who: Who) {
  const { app, mockUserToken } = appFor(who);
  const db: Database = getDatabase(app, `http://${HOST}:${DB_PORT}?ns=${PROJECT_ID}`);
  connectDatabaseEmulator(db, HOST, DB_PORT, mockUserToken ? { mockUserToken } : {});
  return {
    ref: (path: string) => {
      const r = ref(db, path);
      return {
        get: () => get(r),
        set: (v: unknown) => set(r, v),
        update: (v: object) => update(r, v),
        remove: () => remove(r),
      };
    },
  };
}

export function firestoreAs(who: Who): Firestore {
  const { app, mockUserToken } = appFor(who);
  const fs = getFirestore(app);
  connectFirestoreEmulator(fs, HOST, FS_PORT, mockUserToken ? { mockUserToken } : {});
  return fs;
}

export const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;

export function storageAs(who: Who): FirebaseStorage {
  const { app, mockUserToken } = appFor(who);
  const st = getStorage(app, `gs://${STORAGE_BUCKET}`);
  connectStorageEmulator(st, HOST, STORAGE_PORT, mockUserToken ? { mockUserToken } : {});
  return st;
}

export async function disposeClients() {
  const all = apps.splice(0);
  await Promise.all(all.map((a) => deleteApp(a).catch(() => undefined)));
}
