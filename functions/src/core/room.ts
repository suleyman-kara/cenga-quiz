import type {
  AnswerEntry,
  GameMeta,
  GameState,
  Leaderboard,
  PlayerEntry,
  PlayerScore,
  PublicQuestion,
  Quiz,
  RevealData,
} from "../../../shared/types";
import { questionSeconds } from "../../../shared/quizValidate";

/** Subset of club.game used by the server. */
export interface GameConfig {
  defaultQuestionSeconds: number;
  maxPoints: number;
  streakBonus: { enabled: boolean; perStreak: number; max: number };
  leaderboardSize: number;
  maxPlayers: number;
}

/** games/{pin} as read from RTDB (every node optional). */
export interface Room {
  meta?: GameMeta;
  state?: GameState;
  question?: PublicQuestion;
  reveal?: RevealData;
  players?: Record<string, PlayerEntry>;
  /** RTDB may hand this back as an array when keys are dense. */
  answers?: Record<string, Record<string, AnswerEntry>> | (Record<string, AnswerEntry> | undefined)[];
  scores?: Record<string, PlayerScore>;
  leaderboard?: Leaderboard;
  /** kicked uids (true) — rules reject their joins */
  banned?: Record<string, true>;
}

/** Multi-path update relative to games/{pin}; null deletes. */
export type Patch = Record<string, unknown>;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Deep copy safe to write back to RTDB: drops undefined; arrays with holes
 * (as RTDB returns sparse integer-keyed nodes) become plain objects.
 */
export function toPlain(v: unknown): unknown {
  if (Array.isArray(v)) {
    let dense = true;
    for (let i = 0; i < v.length; i++) if (v[i] === undefined || v[i] === null) dense = false;
    if (dense) return v.map(toPlain);
    const out: Obj = {};
    v.forEach((x, i) => {
      if (x !== undefined && x !== null) out[String(i)] = toPlain(x);
    });
    return out;
  }
  if (isObj(v)) {
    const out: Obj = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = toPlain(x);
    return out;
  }
  return v;
}

function setPath(root: Obj, parts: string[], value: unknown): void {
  const [head, ...rest] = parts;
  if (rest.length === 0) {
    if (value === null || value === undefined) delete root[head];
    else root[head] = toPlain(value);
    return;
  }
  let child = root[head];
  if (Array.isArray(child)) child = { ...child };
  if (!isObj(child)) {
    if (value === null || value === undefined) return;
    child = {};
  }
  root[head] = child;
  setPath(child as Obj, rest, value);
  if (Object.keys(child as Obj).length === 0) delete root[head];
}

/** Applies a multi-path patch (RTDB `update` semantics) to a copy of `base`. */
export function applyPatch<T = Room>(base: T | null | undefined, patch: Patch): T {
  const root = (isObj(toPlain(base)) ? toPlain(base) : {}) as Obj;
  for (const [path, value] of Object.entries(patch)) {
    setPath(root, path.split("/").filter(Boolean), value);
  }
  return root as T;
}

export function lobbyState(now: number): GameState {
  return { phase: "lobby", qIndex: -1, startedAt: 0, endsAt: 0, updatedAt: now };
}

export function newRoom(meta: GameMeta, now: number): Room {
  return { meta, state: lobbyState(now) };
}

/** The players' view of a question — never includes the correct index. */
export function publicQuestion(quiz: Quiz, index: number, defaultSeconds: number): PublicQuestion {
  const q = quiz.questions[index];
  const pq: PublicQuestion = {
    index,
    text: q.text,
    options: [...q.options],
    seconds: questionSeconds(q, defaultSeconds),
  };
  if (q.imageUrl) pq.imageUrl = q.imageUrl;
  return pq;
}

/** One multi-path update that shows question `index`. */
export function questionPatch(quiz: Quiz, index: number, now: number, defaultSeconds: number): Patch {
  const question = publicQuestion(quiz, index, defaultSeconds);
  const state: GameState = {
    phase: "question",
    qIndex: index,
    startedAt: now,
    endsAt: now + question.seconds * 1000,
    updatedAt: now,
  };
  return { question, reveal: null, state };
}

export function answersFor(room: Room, qIndex: number): Record<string, AnswerEntry> {
  const all = room.answers as Record<string, Record<string, AnswerEntry> | undefined> | undefined;
  return all?.[qIndex] ?? {};
}

/** Reveal is allowed when time is up or every joined player answered the current question. */
export function canReveal(room: Room, now: number): boolean {
  const state = room.state;
  if (!state) return false;
  if (now >= state.endsAt) return true;
  const answers = answersFor(room, state.qIndex);
  const uids = Object.keys(room.players ?? {});
  return uids.length > 0 && uids.every((uid) => answers[uid] !== undefined);
}
