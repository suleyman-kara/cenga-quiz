/**
 * Seeds the local emulators (idempotent):
 *  - host user host@example.com (verified, linked to the google.com provider so it shows up
 *    in the auth emulator's Google sign-in popup)
 *  - allowedHosts/host@example.com
 *  - quizzes/ornek from quizzes/ornek.json, owned by that user
 *
 * Usage: npm run seed   (emulators must be running)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initializeApp } from "firebase-admin/app";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { validateQuiz } from "../shared/quizValidate";

const PROJECT_ID = "demo-club-quiz";
const HOST_EMAIL = "host@example.com";
const QUIZ_ID = "ornek";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
process.env.FIREBASE_DATABASE_EMULATOR_HOST ||= "127.0.0.1:9000";

async function ensureHostUser(): Promise<UserRecord> {
  const auth = getAuth();
  let user: UserRecord;
  try {
    user = await auth.getUserByEmail(HOST_EMAIL);
  } catch {
    user = await auth.createUser({ email: HOST_EMAIL, emailVerified: true, displayName: "Demo Sunucu" });
    console.log(`+ kullanıcı oluşturuldu: ${HOST_EMAIL} (${user.uid})`);
  }
  if (!user.emailVerified) user = await auth.updateUser(user.uid, { emailVerified: true });
  if (!user.providerData.some((p) => p.providerId === "google.com")) {
    user = await auth.updateUser(user.uid, {
      providerToLink: { providerId: "google.com", uid: `google-${user.uid}`, email: HOST_EMAIL, displayName: "Demo Sunucu" },
    });
  }
  return user;
}

async function main(): Promise<void> {
  initializeApp({ projectId: PROJECT_ID, databaseURL: `https://${PROJECT_ID}-default-rtdb.firebaseio.com` });
  const fs = getFirestore();

  const user = await ensureHostUser();
  console.log(`✓ sunucu kullanıcısı: ${HOST_EMAIL} uid=${user.uid}`);

  const hostRef = fs.doc(`allowedHosts/${HOST_EMAIL}`);
  if (!(await hostRef.get()).exists) await hostRef.set({ addedAt: Date.now() });
  console.log(`✓ allowedHosts/${HOST_EMAIL}`);

  const raw: unknown = JSON.parse(readFileSync(join(import.meta.dirname, "../quizzes/ornek.json"), "utf8"));
  const v = validateQuiz(raw);
  if (!v.ok) throw new Error(`quizzes/ornek.json geçersiz:\n${v.errors.join("\n")}`);
  const quizRef = fs.doc(`quizzes/${QUIZ_ID}`);
  const existing = await quizRef.get();
  const now = Date.now();
  await quizRef.set({
    ...v.quiz,
    ownerUid: user.uid,
    createdAt: (existing.data()?.createdAt as number | undefined) ?? now,
    updatedAt: now,
  });
  console.log(`✓ quizzes/${QUIZ_ID} (${v.quiz.questions.length} soru) → sahibi ${user.uid}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("Seed başarısız:", e);
    process.exit(1);
  },
);
