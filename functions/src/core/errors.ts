/** Firebase-free error type for core logic; the IO layer maps it to HttpsError. */
export type GameErrorCode =
  | "unauthenticated"
  | "permission-denied"
  | "not-found"
  | "failed-precondition"
  | "invalid-argument"
  | "resource-exhausted";

export class GameError extends Error {
  constructor(
    readonly code: GameErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GameError";
  }
}
