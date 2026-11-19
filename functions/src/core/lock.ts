/**
 * Transition lock on games/{pin}/state. Players can never write `state`, so an RTDB
 * transaction on it only contends with other host calls — never with joins or answers.
 * The lock also freezes the room's inputs: rules reject joins/leaves/answers while it is fresh.
 */
import type { GameState, LockAction, StateLock } from "../../../shared/types";
import { GameError } from "./errors";

/** A lock older than this is considered left behind by a crashed call and may be overridden. */
export const LOCK_STALE_MS = 30_000;

export function isLockActive(lock: StateLock | undefined | null, now: number): boolean {
  return !!lock && now - lock.at <= LOCK_STALE_MS;
}

export function busyError(): GameError {
  return new GameError("failed-precondition", "Başka bir işlem sürüyor, lütfen tekrar deneyin.");
}

/** Returns `state` with our lock; throws while another fresh lock is held. */
export function lockState(state: GameState, by: LockAction, now: number): GameState {
  if (isLockActive(state.lock, now)) throw busyError();
  return { ...state, lock: { by, at: now } };
}

export function ownsLock(state: GameState | null | undefined, lock: StateLock): boolean {
  return state?.lock?.by === lock.by && state.lock.at === lock.at;
}

/** Removes the lock only if it is still ours (it may have been overridden as stale). */
export function unlockState(state: GameState, lock: StateLock): GameState {
  if (!ownsLock(state, lock)) return state;
  const { lock: _drop, ...rest } = state;
  void _drop;
  return rest;
}
