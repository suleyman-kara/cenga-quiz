import { describe, it, expect } from "vitest";
import { callLog } from "./callLog";
import { GameError } from "./errors";
import { busyError } from "./lock";

describe("callLog (one structured line per host call, for Cloud Logging metrics)", () => {
  it("success: info with action, pin and duration", () => {
    expect(callLog({ action: "reveal", pin: "123456", qIndex: 2 }, 84)).toEqual({
      severity: "info",
      fields: { action: "reveal", pin: "123456", ms: 84, outcome: "ok" },
    });
  });

  it("lock contention is a warning with its own outcome (alert on its rate)", () => {
    expect(callLog({ action: "startGame", pin: "123456" }, 12, busyError())).toMatchObject({
      severity: "warn",
      fields: { outcome: "busy" },
    });
  });

  it("a refused request is info with the error code; an unexpected failure is an error", () => {
    expect(callLog({ action: "reveal", pin: "1" }, 5, new GameError("failed-precondition", "x"))).toMatchObject({
      severity: "info",
      fields: { outcome: "refused:failed-precondition" },
    });
    expect(callLog({ action: "reveal" }, 5, new Error("boom"))).toMatchObject({
      severity: "error",
      fields: { action: "reveal", pin: null, outcome: "error" },
    });
  });

  it("never logs anything but the action and pin from the request (no names, no e-mails)", () => {
    const { fields } = callLog({ action: "kickPlayer", pin: "123456", uid: "secret", email: "a@b.c" }, 1);
    expect(Object.keys(fields).sort()).toEqual(["action", "ms", "outcome", "pin"]);
    expect(callLog("garbage", 1).fields).toMatchObject({ action: null, pin: null });
  });
});
