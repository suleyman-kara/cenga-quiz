import type { CallableContract, GameMeta, LiveGameDoc, LockAction, QuizDoc } from "../../../shared/types";
import { validateQuiz } from "../../../shared/quizValidate";
import { generatePin } from "../../../shared/pin";
import { club } from "../../../src/club.config";
import type { AuthLike } from "../core/auth";
import { parseBool, parsePin, parseQuizId, parseUid } from "../core/auth";
import { busyError, isLockActive } from "../core/lock";
import { GameError } from "../core/errors";
import { allocatePin } from "../core/pin";
import { applyPatch, newRoom, type GameConfig, type Patch, type Room } from "../core/room";
import {
  guard,
  planEnd,
  planKick,
  planNext,
  planReveal,
  planSetLobbyLocked,
  planShowLeaderboard,
  planStart,
  type OpContext,
} from "../core/ops";
import { buildGameResult } from "../core/archive";
import { requireAllowedHost } from "./hostAuth";
import {
  acquireLock,
  loadLiveQuiz,
  readHead,
  readParts,
  releaseLock,
  updateRoom,
  writePatch,
  type RoomPart,
} from "./rooms";
import { database, firestore } from "./firebase";

export const gameConfig: GameConfig = club.game;
const namePrefix = club.locale === "en" ? "Player" : "Oyuncu";

type Res<N extends keyof CallableContract> = Promise<CallableContract[N]["res"]>;

export async function createGame(auth: AuthLike | undefined, data: unknown): Res<"createGame"> {
  const uid = await requireAllowedHost(auth);
  const quizId = parseQuizId(data);
  const fs = await firestore();
  const snap = await fs.doc(`quizzes/${quizId}`).get();
  if (!snap.exists) throw new GameError("not-found", "Quiz bulunamadı.");
  const doc = snap.data() as QuizDoc;
  if (doc.ownerUid !== uid) throw new GameError("permission-denied", "Bu quiz size ait değil.");
  const v = validateQuiz(doc);
  if (!v.ok) throw new GameError("failed-precondition", `Quiz geçersiz: ${v.errors.slice(0, 5).join("; ")}`);

  const now = Date.now();
  const meta: GameMeta = {
    hostUid: uid,
    quizId,
    title: v.quiz.title,
    createdAt: now,
    questionCount: v.quiz.questions.length,
  };
  const db = await database();
  const pin = await allocatePin(async (candidate) => {
    const res = await db
      .ref(`games/${candidate}`)
      .transaction((cur: Room | null) => (cur === null ? newRoom(meta, now) : undefined), undefined, false);
    return res.committed;
  }, generatePin);

  const live: LiveGameDoc = { pin, hostUid: uid, quizId, quiz: v.quiz, createdAt: now };
  try {
    await fs.doc(`liveGames/${pin}`).set(live);
  } catch (e) {
    await db.ref(`games/${pin}`).remove();
    throw e;
  }
  return { pin };
}

interface TransitionSpec {
  action: LockAction;
  plan: (room: Room, ctx: OpContext) => Patch;
  needsQuiz: boolean;
  /** nodes read (after the lock) to compute the result */
  parts: readonly RoomPart[];
  /** dry-run the plan on unlocked data first, so precondition failures never take the lock */
  precheck: boolean;
}

const SPECS = {
  start: { action: "start", plan: planStart, needsQuiz: true, parts: ["players"], precheck: true },
  reveal: { action: "reveal", plan: planReveal, needsQuiz: true, parts: ["players", "answers", "scores"], precheck: true },
  showLeaderboard: { action: "showLeaderboard", plan: planShowLeaderboard, needsQuiz: false, parts: [], precheck: false },
  next: { action: "next", plan: planNext, needsQuiz: true, parts: [], precheck: false },
  end: { action: "end", plan: planEnd, needsQuiz: false, parts: ["players", "scores", "leaderboard"], precheck: false },
} satisfies Record<LockAction, TransitionSpec>;

/**
 * Host transition without a room-wide transaction:
 *  1. host + phase checks on meta/state (and an optional dry run on unlocked data),
 *  2. RTDB transaction on games/{pin}/state only → sets state.lock (players never write
 *     state, so joins/answers cannot force retries; rules freeze inputs while locked),
 *  3. reads just the nodes the step needs, computes the result,
 *  4. one multi-path update writes the result together with the new state (lock cleared).
 */
async function transition(
  auth: AuthLike | undefined,
  data: unknown,
  spec: TransitionSpec,
): Promise<{ pin: string; room: Room; patch: Patch; now: number }> {
  const pin = parsePin(data);
  const [uid, quiz, head] = await Promise.all([
    requireAllowedHost(auth),
    spec.needsQuiz ? loadLiveQuiz(pin) : undefined,
    readHead(pin),
  ]);
  const ctx = (now: number): OpContext => ({ uid, now, config: gameConfig, quiz, namePrefix });

  const pre = spec.precheck ? await readParts(pin, spec.parts, head.state?.qIndex) : {};
  spec.plan({ ...head, ...pre }, ctx(Date.now()));

  const { state, lock } = await acquireLock(pin, spec.action, (current, now) => {
    guard({ meta: head.meta, state: current }, ctx(now), spec.action);
  });
  try {
    const parts = await readParts(pin, spec.parts, state.qIndex);
    const room: Room = { ...head, ...parts, state };
    const now = Date.now();
    const patch = spec.plan(room, ctx(now));
    await writePatch(pin, patch);
    return { pin, room, patch, now };
  } catch (e) {
    await releaseLock(pin, lock).catch(() => undefined);
    throw e;
  }
}

export async function startGame(auth: AuthLike | undefined, data: unknown): Res<"startGame"> {
  await transition(auth, data, SPECS.start);
  return { ok: true };
}

export async function reveal(auth: AuthLike | undefined, data: unknown): Res<"reveal"> {
  await transition(auth, data, SPECS.reveal);
  return { ok: true };
}

export async function showLeaderboard(auth: AuthLike | undefined, data: unknown): Res<"showLeaderboard"> {
  await transition(auth, data, SPECS.showLeaderboard);
  return { ok: true };
}

export async function nextQuestion(auth: AuthLike | undefined, data: unknown): Res<"nextQuestion"> {
  await transition(auth, data, SPECS.next);
  return { ok: true };
}

export async function endGame(auth: AuthLike | undefined, data: unknown): Res<"endGame"> {
  const { pin, room, patch, now } = await transition(auth, data, SPECS.end);
  const fs = await firestore();
  const ref = await fs.collection("gameResults").add(buildGameResult(applyPatch(room, patch), { pin, now }));
  await fs.doc(`liveGames/${pin}`).delete();
  return { ok: true, resultId: ref.id };
}

export async function kickPlayer(auth: AuthLike | undefined, data: unknown): Res<"kickPlayer"> {
  const pin = parsePin(data);
  const target = parseUid(data);
  const [uid, head] = await Promise.all([requireAllowedHost(auth), readHead(pin)]);
  const ctx: OpContext = { uid, now: Date.now(), config: gameConfig };
  planKick(head, ctx, target); // host / phase checks before reading more
  // A transition is computing scores from the current players: don't race it.
  if (isLockActive(head.state?.lock, ctx.now)) throw busyError();
  const parts = await readParts(pin, ["players", "scores", "leaderboard"], undefined);
  await updateRoom(pin, planKick({ ...head, ...parts }, ctx, target));
  return { ok: true };
}

export async function setLobbyLocked(auth: AuthLike | undefined, data: unknown): Res<"setLobbyLocked"> {
  const pin = parsePin(data);
  const locked = parseBool(data, "locked");
  const [uid, head] = await Promise.all([requireAllowedHost(auth), readHead(pin)]);
  await updateRoom(pin, planSetLobbyLocked(head, { uid, now: Date.now(), config: gameConfig }, locked));
  return { ok: true, locked };
}
