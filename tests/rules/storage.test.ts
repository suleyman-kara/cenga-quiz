import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment, type TokenOptions } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { anonToken, createEnv, disposeClients, firestoreAs, HOST_EMAIL, HOST_UID, hostToken, storageAs } from "./helpers";

let env: RulesTestEnvironment;
const STRANGER = { uid: "stranger", token: { email: "x@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } } as TokenOptions };
const UNVERIFIED = { uid: HOST_UID, token: { ...hostToken, email_verified: false } as TokenOptions };
const host = () => storageAs({ uid: HOST_UID, token: hostToken });

const png = (bytes: number) => new Uint8Array(bytes).fill(1);
const put = (st: ReturnType<typeof storageAs>, path: string, bytes = 1000, contentType = "image/webp") =>
  uploadBytes(ref(st, path), png(bytes), { contentType });

beforeAll(async () => {
  env = await createEnv("storage");
});
afterAll(async () => {
  await disposeClients();
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearStorage();
  await env.clearFirestore();
  await setDoc(doc(firestoreAs("owner"), "allowedHosts", HOST_EMAIL), { addedAt: 1 });
});
afterEach(async () => {
  await disposeClients();
});

describe("Storage: quiz images", () => {
  it("an allowed host uploads an image (≤ 2 MB) into their own folder; anyone can view it", async () => {
    await assertSucceeds(put(host(), `quizImages/${HOST_UID}/a.webp`));
    await assertSucceeds(getBytes(ref(storageAs({ uid: "p1", token: anonToken }), `quizImages/${HOST_UID}/a.webp`)));
    await assertSucceeds(getBytes(ref(storageAs(null), `quizImages/${HOST_UID}/a.webp`)));
  });

  it("refuses: other people's folder, players, non-hosts, unverified e-mail, signed out", async () => {
    await assertFails(put(host(), "quizImages/someone-else/a.webp"));
    await assertFails(put(storageAs({ uid: "p1", token: anonToken }), "quizImages/p1/a.webp"));
    await assertFails(put(storageAs(STRANGER), "quizImages/stranger/a.webp"));
    await assertFails(put(storageAs(UNVERIFIED), `quizImages/${HOST_UID}/a.webp`));
    await assertFails(put(storageAs(null), `quizImages/${HOST_UID}/a.webp`));
  });

  it("refuses files over 2 MB and anything that is not a PNG / JPEG / WebP / GIF image", async () => {
    await assertFails(put(host(), `quizImages/${HOST_UID}/big.webp`, 2 * 1024 * 1024 + 1));
    await assertFails(put(host(), `quizImages/${HOST_UID}/x.svg`, 1000, "image/svg+xml"));
    await assertFails(put(host(), `quizImages/${HOST_UID}/x.html`, 1000, "text/html"));
    await assertSucceeds(put(host(), `quizImages/${HOST_UID}/x.png`, 1000, "image/png"));
  });

  it("no overwriting (an old quiz keeps its image); the owner may delete; nothing outside quizImages", async () => {
    await assertSucceeds(put(host(), `quizImages/${HOST_UID}/keep.webp`));
    await assertFails(put(host(), `quizImages/${HOST_UID}/keep.webp`));
    await assertFails(deleteObject(ref(storageAs(STRANGER), `quizImages/${HOST_UID}/keep.webp`)));
    await assertSucceeds(deleteObject(ref(host(), `quizImages/${HOST_UID}/keep.webp`)));
    await assertFails(put(host(), "other/keep.webp"));
  });
});
