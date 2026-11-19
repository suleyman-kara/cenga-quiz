import type { Phase } from "../../../shared/types";
import { GameError } from "./errors";

export type GameAction = "start" | "reveal" | "showLeaderboard" | "next" | "end";

const FROM: Record<GameAction, readonly Phase[]> = {
  start: ["lobby"],
  reveal: ["question"],
  showLeaderboard: ["reveal"],
  next: ["reveal", "leaderboard"],
  end: ["lobby", "question", "reveal", "leaderboard"],
};

/** Throws failed-precondition when `action` is not allowed in `phase`. */
export function assertTransition(phase: Phase | undefined, action: GameAction): void {
  if (!phase || !FROM[action].includes(phase)) {
    throw new GameError("failed-precondition", `"${action}" bu aşamada yapılamaz (${phase ?? "bilinmiyor"}).`);
  }
}
