import type { CallableContract, GameMeta, LiveGameDoc, QuizDoc } from "../../../shared/types";
import { validateQuiz } from "../../../shared/quizValidate";
import { generatePin } from "../../../shared/pin";
import { club } from "../../../src/club.config";
import type { AuthLike } from "../core/auth";
import { parsePin, parseQuizId } from "../core/auth";
import { GameError } from "../core/errors";
import { allocatePin } from "../core/pin";
import { newRoom, type GameConfig, type Patch, type Room } from "../core/room";
import { planEnd, planNext, planReveal, planShowLeaderboard, planStart, type OpContext } from "../core/ops";
import { buildGameResult } from "../core/archive";
import { requireAllowedHost } from "./hostAuth";
import { loadLiveQuiz, transactRoom } from "./rooms";
import { database, firestore } from "./firebase";

export const gameConfig: GameConfig = club.game;

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

/** Host check + optional private quiz load, then the transactional transition. */
async function transition(
  auth: AuthLike | undefined,
  data: unknown,
  plan: (room: Room, ctx: OpContext) => Patch,
  needsQuiz: boolean,
): Promise<{ pin: string; room: Room; now: number }> {
  const pin = parsePin(data);
  const [uid, quiz] = await Promise.all([requireAllowedHost(auth), needsQuiz ? loadLiveQuiz(pin) : undefined]);
  let at = 0;
  const room = await transactRoom(pin, (current, now) => {
    at = now;
    return plan(current, { uid, now, config: gameConfig, quiz });
  });
  return { pin, room, now: at };
}

export async function startGame(auth: AuthLike | undefined, data: unknown): Res<"startGame"> {
  await transition(auth, data, planStart, true);
  return { ok: true };
}

export async function reveal(auth: AuthLike | undefined, data: unknown): Res<"reveal"> {
  await transition(auth, data, planReveal, true);
  return { ok: true };
}

export async function showLeaderboard(auth: AuthLike | undefined, data: unknown): Res<"showLeaderboard"> {
  await transition(auth, data, planShowLeaderboard, false);
  return { ok: true };
}

export async function nextQuestion(auth: AuthLike | undefined, data: unknown): Res<"nextQuestion"> {
  await transition(auth, data, planNext, true);
  return { ok: true };
}

export async function endGame(auth: AuthLike | undefined, data: unknown): Res<"endGame"> {
  const { pin, room, now } = await transition(auth, data, planEnd, false);
  const fs = await firestore();
  const ref = await fs.collection("gameResults").add(buildGameResult(room, { pin, now }));
  await fs.doc(`liveGames/${pin}`).delete();
  return { ok: true, resultId: ref.id };
}
