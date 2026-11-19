import type { GameState, LockAction, Phase } from "../../../shared/types";
import { GameError } from "./errors";

export type GameAction = "start" | "reveal" | "showLeaderboard" | "next" | "end" | "kick" | "lockLobby";

const FROM: Record<GameAction, readonly Phase[]> = {
  start: ["lobby"],
  reveal: ["question"],
  showLeaderboard: ["reveal"],
  next: ["reveal", "leaderboard"],
  end: ["lobby", "question", "reveal", "leaderboard"],
  kick: ["lobby", "question", "reveal", "leaderboard"],
  lockLobby: ["lobby", "question", "reveal", "leaderboard"],
};

/** Throws failed-precondition when `action` is not allowed in `phase`. */
export function assertTransition(phase: Phase | undefined, action: GameAction): void {
  if (!phase || !FROM[action].includes(phase)) {
    throw new GameError("failed-precondition", `"${action}" bu aşamada yapılamaz (${phase ?? "bilinmiyor"}).`);
  }
}

export type StepStatus = "proceed" | "already";

/**
 * Idempotency for host steps that carry the qIndex the host is looking at (reveal,
 * showLeaderboard, next = "leave question `expected`"). A step the room has already moved
 * past is "already" (duplicate click, retry, second host tab); a qIndex ahead of the room is
 * a real mismatch. Same-question phase problems are left to assertTransition.
 */
export function stepStatus(state: GameState, action: LockAction, expected?: number): StepStatus {
  if (action === "start") return "proceed";
  if (state.phase === "ended") return "already";
  if (action === "end") return "proceed";
  const q = expected ?? -1;
  if (state.qIndex > q) return "already";
  if (state.qIndex < q) {
    throw new GameError("failed-precondition", `Soru sırası uyuşmuyor (oyun: ${state.qIndex + 1}, istek: ${q + 1}).`);
  }
  if (action === "reveal" && (state.phase === "reveal" || state.phase === "leaderboard")) return "already";
  if (action === "showLeaderboard" && state.phase === "leaderboard") return "already";
  return "proceed";
}
