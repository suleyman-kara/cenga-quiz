import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment, type TokenOptions } from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import type { QuizDoc } from "../../shared/types";
import { anonToken, createEnv, disposeClients, firestoreAs, HOST_EMAIL, HOST_UID, hostToken } from "./helpers";

let env: RulesTestEnvironment;

const OTHER_HOST_UID = "host-2";
const OTHER_HOST_EMAIL = "other@example.com";
const otherHostToken = { ...hostToken, email: OTHER_HOST_EMAIL };
const STRANGER_UID = "stranger";
const strangerToken = { email: "stranger@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } } as TokenOptions;

const hostDb = () => firestoreAs({ uid: HOST_UID, token: hostToken });
const otherHostDb = () => firestoreAs({ uid: OTHER_HOST_UID, token: otherHostToken });
const strangerDb = () => firestoreAs({ uid: STRANGER_UID, token: strangerToken });
const anonDb = (uid = "anon-1") => firestoreAs({ uid, token: anonToken });
const unauthDb = () => firestoreAs(null);

function quiz(ownerUid: string, over: Partial<QuizDoc> = {}): QuizDoc {
  return {
    ownerUid,
    title: "Genel Kültür",
    description: "Deneme",
    questions: [{ text: "2+2?", options: ["3", "4"], correct: 1, seconds: 20 }],
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

async function seedFs(fn: (db: Firestore) => Promise<void>) {
  await fn(firestoreAs("owner"));
}

beforeAll(async () => {
  env = await createEnv("firestore");
});
afterAll(async () => {
  await disposeClients();
  await env?.cleanup();
});
afterEach(async () => {
  await disposeClients();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedFs(async (db) => {
    await setDoc(doc(db, "allowedHosts", HOST_EMAIL), { addedAt: 1 });
    await setDoc(doc(db, "allowedHosts", OTHER_HOST_EMAIL), { addedAt: 1 });
    await setDoc(doc(db, "quizzes", "q1"), quiz(HOST_UID));
    await setDoc(doc(db, "quizzes", "q2"), quiz(OTHER_HOST_UID));
    await setDoc(doc(db, "liveGames", "123456"), { pin: "123456", hostUid: HOST_UID, quizId: "q1", quiz: {}, createdAt: 1 });
    await setDoc(doc(db, "gameResults", "r1"), { pin: "123456", hostUid: HOST_UID, quizId: "q1", title: "x", results: [] });
  });
});

describe("Firestore: allowedHosts", () => {
  it("a signed-in user may read the doc for their own email", async () => {
    await assertSucceeds(getDoc(doc(hostDb(), "allowedHosts", HOST_EMAIL)));
    // non-allowed users can check too (doc simply does not exist)
    await assertSucceeds(getDoc(doc(strangerDb(), "allowedHosts", "stranger@example.com")));
  });
  it("may not read another email's doc", async () => {
    await assertFails(getDoc(doc(hostDb(), "allowedHosts", OTHER_HOST_EMAIL)));
    await assertFails(getDoc(doc(strangerDb(), "allowedHosts", HOST_EMAIL)));
  });
  it("anonymous and unauthenticated users may not read", async () => {
    await assertFails(getDoc(doc(anonDb(), "allowedHosts", HOST_EMAIL)));
    await assertFails(getDoc(doc(unauthDb(), "allowedHosts", HOST_EMAIL)));
  });
  it("may not list the collection", async () => {
    await assertFails(getDocs(collection(hostDb(), "allowedHosts")));
  });
  it("no client writes, not even to own email", async () => {
    await assertFails(setDoc(doc(strangerDb(), "allowedHosts", "stranger@example.com"), { addedAt: 1 }));
    await assertFails(setDoc(doc(hostDb(), "allowedHosts", HOST_EMAIL), { addedAt: 2 }));
    await assertFails(deleteDoc(doc(hostDb(), "allowedHosts", HOST_EMAIL)));
  });
});

describe("Firestore: quizzes", () => {
  it("owner can read, update and delete own quiz", async () => {
    await assertSucceeds(getDoc(doc(hostDb(), "quizzes", "q1")));
    await assertSucceeds(updateDoc(doc(hostDb(), "quizzes", "q1"), { title: "Yeni başlık", updatedAt: 2 }));
    await assertSucceeds(deleteDoc(doc(hostDb(), "quizzes", "q1")));
  });
  it("owner can list own quizzes with an ownerUid filter", async () => {
    await assertSucceeds(getDocs(query(collection(hostDb(), "quizzes"), where("ownerUid", "==", HOST_UID))));
  });
  it("listing without the owner filter is denied", async () => {
    await assertFails(getDocs(collection(hostDb(), "quizzes")));
  });
  it("allowed host can create a quiz they own", async () => {
    await assertSucceeds(setDoc(doc(hostDb(), "quizzes", "new"), quiz(HOST_UID)));
    await assertSucceeds(addDoc(collection(hostDb(), "quizzes"), quiz(HOST_UID)));
  });
  it("cannot create a quiz owned by someone else", async () => {
    await assertFails(setDoc(doc(hostDb(), "quizzes", "new"), quiz(OTHER_HOST_UID)));
  });
  it("non-allowed host cannot create a quiz", async () => {
    await assertFails(setDoc(doc(strangerDb(), "quizzes", "new"), quiz(STRANGER_UID)));
  });
  it("allowed host email with unverified email cannot create", async () => {
    const db = firestoreAs({ uid: HOST_UID, token: { ...hostToken, email_verified: false } as TokenOptions });
    await assertFails(setDoc(doc(db, "quizzes", "new"), quiz(HOST_UID)));
  });
  it("anonymous users cannot create quizzes", async () => {
    await assertFails(setDoc(doc(anonDb(), "quizzes", "new"), quiz("anon-1")));
  });
  it("other users cannot read, update or delete someone else's quiz", async () => {
    await assertFails(getDoc(doc(otherHostDb(), "quizzes", "q1")));
    await assertFails(getDoc(doc(strangerDb(), "quizzes", "q1")));
    await assertFails(updateDoc(doc(otherHostDb(), "quizzes", "q1"), { title: "x" }));
    await assertFails(deleteDoc(doc(otherHostDb(), "quizzes", "q1")));
    await assertFails(setDoc(doc(otherHostDb(), "quizzes", "q1"), quiz(OTHER_HOST_UID)));
  });
  it("anonymous users (players) can never read quizzes", async () => {
    await assertFails(getDoc(doc(anonDb(), "quizzes", "q1")));
    await assertFails(getDocs(collection(anonDb(), "quizzes")));
    await assertFails(getDocs(query(collection(anonDb(), "quizzes"), where("ownerUid", "==", "anon-1"))));
    await assertFails(getDoc(doc(unauthDb(), "quizzes", "q1")));
  });
  it("anonymous user cannot read a quiz even if ownerUid matches", async () => {
    await seedFs(async (db) => {
      await setDoc(doc(db, "quizzes", "qa"), quiz("anon-1"));
    });
    await assertFails(getDoc(doc(anonDb("anon-1"), "quizzes", "qa")));
  });
  it("ownerUid is immutable on update", async () => {
    await assertFails(updateDoc(doc(hostDb(), "quizzes", "q1"), { ownerUid: OTHER_HOST_UID }));
  });
  it.each([
    ["empty title", { title: "" }],
    ["too long title", { title: "x".repeat(121) }],
    ["non-string title", { title: 42 }],
    ["no questions", { questions: [] }],
    ["questions not a list", { questions: { a: 1 } }],
    ["too many questions", { questions: Array.from({ length: 101 }, () => ({ text: "q", options: ["a", "b"], correct: 0 })) }],
  ])("create rejects invalid shape: %s", async (_label, over) => {
    await assertFails(setDoc(doc(hostDb(), "quizzes", "bad"), { ...quiz(HOST_UID), ...over }));
  });
  it("create accepts boundary sizes (title 120, 100 questions)", async () => {
    await assertSucceeds(
      setDoc(
        doc(hostDb(), "quizzes", "big"),
        quiz(HOST_UID, {
          title: "x".repeat(120),
          questions: Array.from({ length: 100 }, () => ({ text: "q", options: ["a", "b"], correct: 0 })),
        }),
      ),
    );
  });
  it.each([
    ["empty title", { title: "" }],
    ["no questions", { questions: [] }],
  ])("update rejects invalid shape: %s", async (_label, over) => {
    await assertFails(updateDoc(doc(hostDb(), "quizzes", "q1"), over));
  });
  it("rejects missing title / questions on create", async () => {
    const { title: _t, ...noTitle } = quiz(HOST_UID);
    const { questions: _q, ...noQuestions } = quiz(HOST_UID);
    await assertFails(setDoc(doc(hostDb(), "quizzes", "bad1"), noTitle));
    await assertFails(setDoc(doc(hostDb(), "quizzes", "bad2"), noQuestions));
  });
});

describe("Firestore: liveGames", () => {
  it("no client access at all, not even for the host", async () => {
    await assertFails(getDoc(doc(hostDb(), "liveGames", "123456")));
    await assertFails(getDoc(doc(anonDb(), "liveGames", "123456")));
    await assertFails(getDocs(collection(hostDb(), "liveGames")));
    await assertFails(setDoc(doc(hostDb(), "liveGames", "999999"), { hostUid: HOST_UID }));
    await assertFails(deleteDoc(doc(hostDb(), "liveGames", "123456")));
  });
});

describe("Firestore: gameResults", () => {
  it("host owner can read own result", async () => {
    await assertSucceeds(getDoc(doc(hostDb(), "gameResults", "r1")));
    await assertSucceeds(getDocs(query(collection(hostDb(), "gameResults"), where("hostUid", "==", HOST_UID))));
  });
  it("others cannot read", async () => {
    await assertFails(getDoc(doc(otherHostDb(), "gameResults", "r1")));
    await assertFails(getDoc(doc(anonDb(), "gameResults", "r1")));
    await assertFails(getDocs(collection(hostDb(), "gameResults")));
  });
  it("no client writes", async () => {
    await assertFails(setDoc(doc(hostDb(), "gameResults", "r2"), { hostUid: HOST_UID }));
    await assertFails(updateDoc(doc(hostDb(), "gameResults", "r1"), { title: "y" }));
    await assertFails(deleteDoc(doc(hostDb(), "gameResults", "r1")));
  });
});

describe("Firestore: everything else denied", () => {
  it("unknown collections are denied", async () => {
    await assertFails(getDoc(doc(hostDb(), "users", HOST_UID)));
    await assertFails(setDoc(doc(hostDb(), "users", HOST_UID), { a: 1 }));
    await assertFails(setDoc(doc(hostDb(), "quizzes", "q1", "sub", "x"), { a: 1 }));
  });
});
