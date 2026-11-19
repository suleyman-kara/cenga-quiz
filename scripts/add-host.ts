/**
 * Adds an e-mail to allowedHosts so that account can create and run games.
 *
 *   npm run add-host -- someone@gmail.com
 *
 * With FIRESTORE_EMULATOR_HOST set it writes to the local emulator (project demo-club-quiz
 * unless GCLOUD_PROJECT is set); otherwise to the real project using Application Default
 * Credentials (`gcloud auth application-default login`). The project id comes from
 * GCLOUD_PROJECT / GOOGLE_CLOUD_PROJECT or the "default" entry in .firebaserc.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function projectFromFirebaserc(): string | undefined {
  const p = join(import.meta.dirname, "../.firebaserc");
  if (!existsSync(p)) return undefined;
  try {
    return (JSON.parse(readFileSync(p, "utf8")) as { projects?: { default?: string } }).projects?.default;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const email = arg?.trim().toLowerCase();
  if (!email || !/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) {
    console.error("Kullanım: npm run add-host -- e-posta@adresi.com");
    process.exit(2);
  }

  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  let projectId: string | undefined;
  if (emulator) {
    projectId = process.env.GCLOUD_PROJECT || "demo-club-quiz";
    initializeApp({ projectId });
    console.log(`→ Emulator (${emulator}), proje: ${projectId}`);
  } else {
    projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || projectFromFirebaserc();
    if (!projectId) {
      console.error("Proje kimliği bulunamadı: GCLOUD_PROJECT ayarlayın ya da .firebaserc oluşturun.");
      process.exit(2);
    }
    initializeApp({ credential: applicationDefault(), projectId });
    console.log(`→ GERÇEK proje: ${projectId} (Application Default Credentials)`);
  }

  await getFirestore().doc(`allowedHosts/${email}`).set({ addedAt: Date.now() }, { merge: true });
  console.log(`✓ allowedHosts/${email} eklendi.`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("Eklenemedi:", e);
    process.exit(1);
  },
);
