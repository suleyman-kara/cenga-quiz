import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { allowHost, disposeClients, expectCode, resetEmulators, saveQuiz, signInGoogle } from "./helpers";
import { HOST_CALLABLE } from "../../shared/types";

describe("host dispatcher callable", () => {
  beforeEach(resetEmulators);
  afterAll(disposeClients);

  it("serves every host action through one callable named `host`", async () => {
    expect(HOST_CALLABLE).toBe("host");
    await allowHost("host@example.com");
    const h = await signInGoogle("host1", "host@example.com");
    await saveQuiz("q1", h.uid);
    const res = (await h.callRaw("host", { action: "createGame", quizId: "q1" })) as { pin: string };
    expect(res.pin).toMatch(/^[1-9]\d{5}$/);
  });

  it("rejects a missing or unknown action", async () => {
    await allowHost("host@example.com");
    const h = await signInGoogle("host1", "host@example.com");
    expect(await expectCode(h.callRaw("host", { quizId: "q1" }))).toBe("functions/invalid-argument");
    expect(await expectCode(h.callRaw("host", { action: "dropDatabase" }))).toBe("functions/invalid-argument");
    expect(await expectCode(h.callRaw("host", { action: "toString" }))).toBe("functions/invalid-argument");
    expect(await expectCode(h.callRaw("host", null))).toBe("functions/invalid-argument");
  });

  it("the old per-action callables are gone", async () => {
    await allowHost("host@example.com");
    const h = await signInGoogle("host1", "host@example.com");
    // with the old endpoints these payloads would be rejected as invalid-argument by the handler
    for (const name of ["createGame", "startGame", "reveal", "endGame"]) {
      const code = await expectCode(h.callRaw(name, { quizId: "", pin: "abc" }));
      expect(code).not.toBe("resolved");
      expect(code).not.toBe("functions/invalid-argument");
    }
  });
});
