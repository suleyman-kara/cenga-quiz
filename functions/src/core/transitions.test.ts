import { describe, it, expect } from "vitest";
import { assertTransition, type GameAction } from "./transitions";
import { GameError } from "./errors";
import type { Phase } from "../../../shared/types";

const allowed: Record<GameAction, Phase[]> = {
  start: ["lobby"],
  reveal: ["question"],
  showLeaderboard: ["reveal"],
  next: ["reveal", "leaderboard"],
  end: ["lobby", "question", "reveal", "leaderboard"],
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
