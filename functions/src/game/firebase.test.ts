import { describe, it, expect } from "vitest";
import { emulatorDatabaseURL } from "./firebase";

describe("emulatorDatabaseURL", () => {
  it("is undefined outside the database emulator", () => {
    expect(emulatorDatabaseURL({ GCLOUD_PROJECT: "demo-x" })).toBeUndefined();
  });
  it("uses the default-rtdb namespace for demo projects", () => {
    const env = { FIREBASE_DATABASE_EMULATOR_HOST: "127.0.0.1:9000", FIREBASE_CONFIG: '{"projectId":"demo-x"}' };
    expect(emulatorDatabaseURL(env)).toBe("https://demo-x-default-rtdb.firebaseio.com");
    expect(emulatorDatabaseURL({ FIREBASE_DATABASE_EMULATOR_HOST: "h", GCLOUD_PROJECT: "demo-y" })).toBe(
      "https://demo-y-default-rtdb.firebaseio.com",
    );
  });
  it("leaves real projects alone", () => {
    expect(emulatorDatabaseURL({ FIREBASE_DATABASE_EMULATOR_HOST: "h", FIREBASE_CONFIG: '{"projectId":"real"}' })).toBeUndefined();
  });
});
