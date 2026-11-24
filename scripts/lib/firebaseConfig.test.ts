import { describe, it, expect } from "vitest";
import { parseFirebaseConfig, buildOutputs, mergeEnvFile } from "./firebaseConfig";

const SNIPPET = `
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
const firebaseConfig = {
  apiKey: "AIzaSyTEST-key_123",
  authDomain: "kulup-quiz.firebaseapp.com",
  databaseURL: "https://kulup-quiz-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "kulup-quiz",
  storageBucket: "kulup-quiz.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456",
  measurementId: "G-XYZ"
};
const app = initializeApp(firebaseConfig);
`;

describe("parseFirebaseConfig", () => {
  it("parses the console JS snippet", () => {
    const r = parseFirebaseConfig(SNIPPET);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config).toEqual({
      apiKey: "AIzaSyTEST-key_123",
      authDomain: "kulup-quiz.firebaseapp.com",
      databaseURL: "https://kulup-quiz-default-rtdb.europe-west1.firebasedatabase.app",
      projectId: "kulup-quiz",
      appId: "1:1234567890:web:abcdef123456",
      storageBucket: "kulup-quiz.firebasestorage.app",
    });
    expect(r.warnings).toEqual([]);
  });

  it("parses plain JSON too", () => {
    const r = parseFirebaseConfig(
      JSON.stringify({ apiKey: "k", authDomain: "proj-x.firebaseapp.com", projectId: "proj-x", appId: "1:2:web:3",
        databaseURL: "https://proj-x-default-rtdb.europe-west1.firebasedatabase.app" }),
    );
    expect(r.ok).toBe(true);
  });

  it("reports missing required keys", () => {
    const r = parseFirebaseConfig(`const firebaseConfig = { apiKey: "k", projectId: "p" };`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(" ")).toMatch(/appId/);
    expect(r.errors.join(" ")).toMatch(/databaseURL/);
  });

  it("warns when the database is not in europe-west1", () => {
    const r = parseFirebaseConfig(SNIPPET.replace(".europe-west1.firebasedatabase.app", ".firebaseio.com").replace("kulup-quiz-default-rtdb", "kulup-quiz-default-rtdb"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.join(" ")).toMatch(/europe-west1/);
  });

  it("rejects non-https database URLs and injection attempts", () => {
    expect(parseFirebaseConfig(SNIPPET.replace("https://kulup", "http://kulup")).ok).toBe(false);
    expect(parseFirebaseConfig(SNIPPET.replace('"kulup-quiz",\n  storage', '"kulup quiz\\nX=1",\n  storage')).ok).toBe(false);
  });
});

describe("buildOutputs", () => {
  it("builds .firebaserc, web env and functions env", () => {
    const r = parseFirebaseConfig(SNIPPET);
    if (!r.ok) throw new Error("parse failed");
    const out = buildOutputs(r.config, { recaptchaSiteKey: "6Lc-site" });
    expect(JSON.parse(out.firebaserc)).toEqual({ projects: { default: "kulup-quiz" } });
    expect(out.webEnv).toContain("VITE_FIREBASE_PROJECT_ID=kulup-quiz");
    expect(out.webEnv).toContain("VITE_FIREBASE_DATABASE_URL=https://kulup-quiz-default-rtdb.europe-west1.firebasedatabase.app");
    expect(out.webEnv).toContain("VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=6Lc-site");
    expect(out.webEnv).toContain("VITE_FIREBASE_STORAGE_BUCKET=kulup-quiz.firebasestorage.app");
    expect(out.webEnv).not.toContain("VITE_USE_EMULATORS");
    expect(out.functionsEnvFile).toBe("functions/.env.kulup-quiz");
    expect(out.functionsEnv).toContain("DATABASE_URL=https://kulup-quiz-default-rtdb.europe-west1.firebasedatabase.app");
  });
});

describe("mergeEnvFile", () => {
  const HEADER = "# configure script tarafından üretildi\n";

  it("returns the generated content when there is no existing file", () => {
    const gen = HEADER + "DATABASE_URL=https://a\n";
    expect(mergeEnvFile(gen, undefined)).toBe(gen);
  });

  it("keeps lines the script does not manage (e.g. ENFORCE_APP_CHECK, MIN_INSTANCES)", () => {
    const existing = HEADER + "DATABASE_URL=https://old\nMIN_INSTANCES=1\nENFORCE_APP_CHECK=true\n";
    const gen = HEADER + "DATABASE_URL=https://new\n";
    expect(mergeEnvFile(gen, existing)).toBe(
      HEADER + "DATABASE_URL=https://new\nMIN_INSTANCES=1\nENFORCE_APP_CHECK=true\n",
    );
  });

  it("generated non-empty values win over existing ones", () => {
    const existing = "VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=old-key\n";
    const gen = HEADER + "VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=new-key\n";
    expect(mergeEnvFile(gen, existing)).toBe(HEADER + "VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=new-key\n");
  });

  it("an empty generated value does not erase an existing one (configure without --recaptcha)", () => {
    const existing = HEADER + "VITE_FIREBASE_APP_ID=x\nVITE_RECAPTCHA_ENTERPRISE_SITE_KEY=site-key\n";
    const gen = HEADER + "VITE_FIREBASE_APP_ID=y\nVITE_RECAPTCHA_ENTERPRISE_SITE_KEY=\n";
    expect(mergeEnvFile(gen, existing)).toBe(
      HEADER + "VITE_FIREBASE_APP_ID=y\nVITE_RECAPTCHA_ENTERPRISE_SITE_KEY=site-key\n",
    );
  });

  it("keeps user comments, drops the old generated header and blank lines, handles CRLF", () => {
    const existing = HEADER.replace("\n", "\r\n") + "DATABASE_URL=https://old\r\n\r\n# etkinlik günü\r\nMIN_INSTANCES=1\r\n";
    const gen = HEADER + "DATABASE_URL=https://new\n";
    expect(mergeEnvFile(gen, existing)).toBe(HEADER + "DATABASE_URL=https://new\n# etkinlik günü\nMIN_INSTANCES=1\n");
  });
});
