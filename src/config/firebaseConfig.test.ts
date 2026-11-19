import { describe, it, expect } from "vitest";
import { ConfigError, EMULATORS, resolveFirebaseConfig as resolve, type ClientEnv } from "./firebaseConfig";

const resolveFirebaseConfig = (env: ClientEnv) => resolve(env, EMULATORS);

const full: ClientEnv = {
  DEV: false,
  VITE_FIREBASE_API_KEY: "k",
  VITE_FIREBASE_AUTH_DOMAIN: "p.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "p",
  VITE_FIREBASE_DATABASE_URL: "https://p-default-rtdb.europe-west1.firebasedatabase.app",
  VITE_FIREBASE_APP_ID: "1:2:web:3",
};

describe("resolveFirebaseConfig", () => {
  it("production build with full config uses the real project, never emulators", () => {
    const r = resolveFirebaseConfig(full);
    expect(r.useEmulators).toBe(false);
    expect(r.options.projectId).toBe("p");
    expect(r.options.databaseURL).toContain("firebasedatabase.app");
  });

  it("production build ignores VITE_USE_EMULATORS=true", () => {
    const r = resolveFirebaseConfig({ ...full, VITE_USE_EMULATORS: "true" });
    expect(r.useEmulators).toBe(false);
  });

  it("production build with missing config throws a ConfigError naming the missing keys", () => {
    expect(() => resolveFirebaseConfig({ DEV: false })).toThrow(ConfigError);
    try {
      resolveFirebaseConfig({ ...full, VITE_FIREBASE_DATABASE_URL: "", VITE_FIREBASE_APP_ID: undefined });
    } catch (e) {
      expect((e as ConfigError).missing).toEqual(["VITE_FIREBASE_DATABASE_URL", "VITE_FIREBASE_APP_ID"]);
    }
  });

  it("dev without a project id uses the emulators", () => {
    const r = resolveFirebaseConfig({ DEV: true });
    expect(r.useEmulators).toBe(true);
    expect(r.options.projectId).toMatch(/^demo-/);
  });

  it("dev with VITE_USE_EMULATORS=true uses the emulators even with a project", () => {
    expect(resolveFirebaseConfig({ ...full, DEV: true, VITE_USE_EMULATORS: "true" }).useEmulators).toBe(true);
  });

  it("dev with a project and no emulator flag talks to the real project", () => {
    const r = resolveFirebaseConfig({ ...full, DEV: true });
    expect(r.useEmulators).toBe(false);
    expect(r.options.projectId).toBe("p");
  });

  it("without the emulator setup (production code path) emulators are never used", () => {
    expect(() => resolve({ DEV: true })).toThrow(ConfigError);
  });

  it("dev with a project but incomplete config also throws", () => {
    expect(() => resolveFirebaseConfig({ DEV: true, VITE_FIREBASE_PROJECT_ID: "p" })).toThrow(ConfigError);
  });
});
