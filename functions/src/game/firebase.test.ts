import { describe, it, expect } from "vitest";
import { appOptions, databaseTriggerRegion, emulatorDatabaseURL } from "./firebase";

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

describe("appOptions (DATABASE_URL param)", () => {
  it("leaves the default app config alone when empty", () => {
    expect(appOptions("")).toBeUndefined();
    expect(appOptions("   ")).toBeUndefined();
  });
  it("passes a regional RTDB URL as databaseURL", () => {
    expect(appOptions(" https://p-default-rtdb.europe-west1.firebasedatabase.app ")).toEqual({
      databaseURL: "https://p-default-rtdb.europe-west1.firebasedatabase.app",
    });
  });
});

describe("databaseTriggerRegion", () => {
  it("is the functions region (= the RTDB instance's location) in production", () => {
    expect(databaseTriggerRegion({}, "europe-west1")).toBe("europe-west1");
  });
  it("is us-central1 in the emulator, the only region the emulated RTDB delivers events to", () => {
    expect(databaseTriggerRegion({ FUNCTIONS_EMULATOR: "true" }, "europe-west1")).toBe("us-central1");
  });
});
