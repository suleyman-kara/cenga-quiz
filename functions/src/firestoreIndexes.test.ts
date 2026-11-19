/** rules/firestore.indexes.json: TTL policy on gameResults.expireAt, deployable by firebase-tools. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const ROOT = join(__dirname, "..", "..");
const spec = JSON.parse(readFileSync(join(ROOT, "rules", "firestore.indexes.json"), "utf8"));
const cfg = JSON.parse(readFileSync(join(ROOT, "firebase.json"), "utf8"));

describe("firestore.indexes.json", () => {
  it("declares the TTL policy on gameResults.expireAt (no single-field index on it)", () => {
    expect(spec.fieldOverrides).toContainEqual({
      collectionGroup: "gameResults",
      fieldPath: "expireAt",
      ttl: true,
      indexes: [],
    });
  });
  it("is the indexes file firebase.json deploys", () => {
    expect(cfg.firestore.indexes).toBe("rules/firestore.indexes.json");
  });
  it("passes the firebase-tools spec validation used by `firebase deploy --only firestore:indexes`", () => {
    const require = createRequire(join(ROOT, "package.json"));
    const { FirestoreApi } = require("firebase-tools/lib/firestore/api.js") as {
      FirestoreApi: new () => { validateSpec(s: unknown): void; upgradeOldSpec(s: unknown): unknown };
    };
    const api = new FirestoreApi();
    expect(() => api.validateSpec(api.upgradeOldSpec(spec))).not.toThrow();
    // sanity: the validator does look at ttl
    const bad = { ...spec, fieldOverrides: [{ ...spec.fieldOverrides[0], ttl: "yes" }] };
    expect(() => api.validateSpec(api.upgradeOldSpec(bad))).toThrow();
  });
});
