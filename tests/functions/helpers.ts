/** Shared helpers for Functions integration tests (run inside `firebase emulators:exec`). */
import { initializeApp as initClient, deleteApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  signInWithCredential,
  signInAnonymously,
  GoogleAuthProvider,
} from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import { getDatabase as getClientDb, connectDatabaseEmulator, type Database as ClientDb } from "firebase/database";
import { initializeApp as initAdmin, getApps as getAdminApps, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getDatabase, ServerValue, type Database } from "firebase-admin/database";
import { HOST_CALLABLE, type HostAction, type HostActionMap, type Quiz } from "../../shared/types";

export const PROJECT_ID = "demo-club-quiz";
export const RTDB_NS = `${PROJECT_ID}-default-rtdb`;
export const RTDB_URL = `http://127.0.0.1:9000?ns=${RTDB_NS}`;
export const REGION = "europe-west1";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= "127.0.0.1:9000";
process.env.GCLOUD_PROJECT ??= PROJECT_ID;
process.env.FIREBASE_CONFIG ??= JSON.stringify({ projectId: PROJECT_ID, databaseURL: RTDB_URL });

let adminApp: App | undefined;
function admin(): App {
  adminApp ??=
    getAdminApps().find((a) => a.name === "tests") ??
    initAdmin({ projectId: PROJECT_ID, databaseURL: RTDB_URL }, "tests");
  return adminApp;
}
export const adminFs = (): Firestore => getFirestore(admin());
export const adminDb = (): Database => getDatabase(admin());
export { ServerValue };

const clientApps: FirebaseApp[] = [];
let appSeq = 0;

function newClientApp(): FirebaseApp {
  const app = initClient(
    { projectId: PROJECT_ID, apiKey: "fake-api-key", databaseURL: RTDB_URL, authDomain: "localhost" },
    `client-${Date.now()}-${appSeq++}`,
  );
  connectAuthEmulator(getAuth(app), "http://127.0.0.1:9099", { disableWarnings: true });
  clientApps.push(app);
  return app;
}

export interface Client {
  app: FirebaseApp;
  uid: string;
  db: ClientDb;
  /** Host action through the single `host` dispatcher callable. */
  call<A extends HostAction>(action: A, data: HostActionMap[A]["req"]): Promise<HostActionMap[A]["res"]>;
  /** Any callable by name with a raw payload (for contract tests). */
  callRaw(name: string, data: unknown): Promise<unknown>;
}

function wrap(app: FirebaseApp, uid: string): Client {
  const fns = getFunctions(app, REGION);
  connectFunctionsEmulator(fns, "127.0.0.1", 5001);
  const db = getClientDb(app);
  connectDatabaseEmulator(db, "127.0.0.1", 9000);
  return {
    app,
    uid,
    db,
    async call(action, data) {
      const res = await httpsCallable(fns, HOST_CALLABLE)({ action, ...data });
      return res.data as never;
    },
    async callRaw(name, data) {
      return (await httpsCallable(fns, name)(data)).data;
    },
  };
}

/** Google-provider user in the auth emulator. */
export async function signInGoogle(sub: string, email: string, emailVerified = true): Promise<Client> {
  const app = newClientApp();
  const cred = GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: emailVerified }));
  const { user } = await signInWithCredential(getAuth(app), cred);
  return wrap(app, user.uid);
}

export async function signInAnon(): Promise<Client> {
  const app = newClientApp();
  const { user } = await signInAnonymously(getAuth(app));
  return wrap(app, user.uid);
}

/** Not signed in at all. */
export function anonymousCaller(): Client {
  return wrap(newClientApp(), "");
}

export async function disposeClients(): Promise<void> {
  await Promise.all(clientApps.splice(0).map((a) => deleteApp(a)));
}

export async function resetEmulators(): Promise<void> {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: "DELETE",
  });
  await adminDb().ref().set(null);
}

export async function allowHost(email: string): Promise<void> {
  await adminFs().doc(`allowedHosts/${email}`).set({ addedAt: Date.now() });
}

export const testQuiz: Quiz = {
  title: "Test Yarışması",
  questions: [
    { text: "Birinci soru", options: ["A", "B", "C", "D"], correct: 1, seconds: 5 },
    { text: "İkinci soru", options: ["Doğru", "Yanlış"], correct: 0, seconds: 5 },
    { text: "Üçüncü soru", options: ["X", "Y", "Z"], correct: 2, seconds: 5 },
  ],
};

export async function saveQuiz(id: string, ownerUid: string, quiz: Quiz = testQuiz): Promise<void> {
  await adminFs()
    .doc(`quizzes/${id}`)
    .set({ ...quiz, ownerUid, createdAt: Date.now(), updatedAt: Date.now() });
}

export async function readRoom<T = unknown>(pin: string, path = ""): Promise<T> {
  return (await adminDb().ref(`games/${pin}${path ? `/${path}` : ""}`).get()).val() as T;
}

/** Admin-side join (bypasses rules). */
export async function adminJoin(pin: string, uid: string, name: string): Promise<void> {
  await adminDb().ref(`games/${pin}/players/${uid}`).set({ name, joinedAt: ServerValue.TIMESTAMP });
}

/** Admin-side answer; `offsetMs` → explicit time relative to the question start for deterministic scores. */
export async function adminAnswer(pin: string, qIndex: number, uid: string, choice: number, offsetMs?: number) {
  let at: number | object = ServerValue.TIMESTAMP;
  if (offsetMs !== undefined) {
    const startedAt = await readRoom<number>(pin, "state/startedAt");
    at = startedAt + offsetMs;
  }
  await adminDb().ref(`games/${pin}/answers/${qIndex}/${uid}`).set({ choice, at });
}

export async function expectCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return "resolved";
}
