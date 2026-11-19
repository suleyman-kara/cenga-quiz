import { describe, it, expect } from "vitest";
import { assertTransition, stepStatus, type GameAction } from "./transitions";
import { GameError } from "./errors";
import type { Phase } from "../../../shared/types";

const allowed: Record<GameAction, Phase[]> = {
  start: ["lobby"],
  reveal: ["question"],
  showLeaderboard: ["reveal"],
  next: ["reveal", "leaderboard"],
  end: ["lobby", "question", "reveal", "leaderboard"],
  kick: ["lobby", "question", "reveal", "leaderboard"],
  lockLobby: ["lobby", "question", "reveal", "leaderboard"],
};
const phases: Phase[] = ["lobby", "question", "reveal", "leaderboard", "ended"];

describe("assertTransition", () => {
  for (const action of Object.keys(allowed) as GameAction[]) {
    for (const phase of phases) {
      const ok = allowed[action].includes(phase);
      it(`${action} from ${phase} → ${ok ? "allowed" : "refused"}`, () => {
        if (ok) expect(() => assertTransition(phase, action)).not.toThrow();
        else {
          try {
            assertTransition(phase, action);
            expect.unreachable();
          } catch (e) {
            expect(e).toBeInstanceOf(GameError);
            expect((e as GameError).code).toBe("failed-precondition");
          }
        }
      });
    }
  }

  it("refuses an unknown/missing phase", () => {
    expect(() => assertTransition(undefined, "start")).toThrow(GameError);
  });
});

describe("stepStatus (expected qIndex)", () => {
  const st = (phase: Phase, qIndex: number) => ({ phase, qIndex, startedAt: 0, endsAt: 0, updatedAt: 0 });
  const status = (phase: Phase, q: number, action: Parameters<typeof stepStatus>[1], expected?: number) => {
    try {
      return stepStatus(st(phase, q), action, expected);
    } catch (e) {
      return e instanceof GameError ? `error:${e.code}` : "other";
    }
  };
  it("reveal", () => {
    expect(status("question", 2, "reveal", 2)).toBe("proceed");
    expect(status("reveal", 2, "reveal", 2)).toBe("already");
    expect(status("leaderboard", 2, "reveal", 2)).toBe("already");
    expect(status("question", 3, "reveal", 2)).toBe("already");
    expect(status("ended", 1, "reveal", 2)).toBe("already");
    expect(status("question", 1, "reveal", 2)).toBe("error:failed-precondition");
    expect(status("lobby", -1, "reveal", 0)).toBe("error:failed-precondition");
  });
  it("showLeaderboard", () => {
    expect(status("reveal", 1, "showLeaderboard", 1)).toBe("proceed");
    expect(status("leaderboard", 1, "showLeaderboard", 1)).toBe("already");
    expect(status("question", 2, "showLeaderboard", 1)).toBe("already");
    expect(status("ended", 1, "showLeaderboard", 1)).toBe("already");
    // current question not revealed yet: left to the phase check
    expect(status("question", 1, "showLeaderboard", 1)).toBe("proceed");
    expect(status("reveal", 0, "showLeaderboard", 1)).toBe("error:failed-precondition");
  });
  it("next (expected = the question being left)", () => {
    expect(status("reveal", 1, "next", 1)).toBe("proceed");
    expect(status("leaderboard", 1, "next", 1)).toBe("proceed");
    expect(status("question", 2, "next", 1)).toBe("already");
    expect(status("reveal", 2, "next", 1)).toBe("already");
    expect(status("ended", 1, "next", 1)).toBe("already");
    expect(status("reveal", 0, "next", 1)).toBe("error:failed-precondition");
  });
  it("end is already done once ended; start has no idempotent form", () => {
    expect(status("ended", 0, "end")).toBe("already");
    expect(status("reveal", 0, "end")).toBe("proceed");
    expect(status("question", 0, "start")).toBe("proceed");
  });
});
