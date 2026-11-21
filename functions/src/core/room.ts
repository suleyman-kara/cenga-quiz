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
  streakBonus: { enabled: boolean; steps: readonly number[] };
  leaderboardSize: number;
  maxPlayers: number;
  /** question published this long before its clock starts (state.startedAt) */
  leadInMs: number;
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

/**
 * One multi-path update that shows question `index`. The question is published now; the clock
 * (and answer acceptance, see rules) starts `leadInMs` later so every phone has it first.
 */
export function questionPatch(quiz: Quiz, index: number, now: number, defaultSeconds: number, leadInMs = 0): Patch {
  const question = publicQuestion(quiz, index, defaultSeconds);
  const startedAt = now + Math.max(0, leadInMs);
  const state: GameState = {
    phase: "question",
    qIndex: index,
    startedAt,
    endsAt: startedAt + question.seconds * 1000,
    updatedAt: now,
  };
  return { question, reveal: null, state };
}

export function answersFor(room: Room, qIndex: number): Record<string, AnswerEntry> {
  const all = room.answers as Record<string, Record<string, AnswerEntry> | undefined> | undefined;
  return all?.[qIndex] ?? {};
}

function isFullEntry(p: unknown): p is PlayerEntry {
  return isObj(p) && typeof p.name === "string" && typeof p.joinedAt === "number";
}

/**
 * The players that count: full entries ({ name, joinedAt }) whose uid is not banned. A banned
 * uid or a partial entry (left behind by an older racing write) is never scored or listed.
 */
export function activePlayers(room: Room): Record<string, PlayerEntry> {
  const out: Record<string, PlayerEntry> = {};
  for (const [uid, p] of Object.entries(room.players ?? {})) {
    if (room.banned?.[uid] || !isFullEntry(p)) continue;
    out[uid] = p;
  }
  return out;
}

/** Patch that deletes players entries that do not count (banned uid or partial entry). */
export function purgeInactivePlayers(room: Room): Patch {
  const active = activePlayers(room);
  const patch: Patch = {};
  for (const uid of Object.keys(room.players ?? {})) if (!active[uid]) patch[`players/${uid}`] = null;
  return patch;
}

/**
 * The host may reveal once answering opened (now >= startedAt), even with time left: answers that
 * arrived so far are scored, the rest count as "no answer". The "Hazır olun" lead-in is refused.
 * Late answers are impossible afterwards: the lock (and then phase "reveal") freezes answer writes.
 */
export function canReveal(room: Room, now: number): boolean {
  const state = room.state;
  if (!state) return false;
  return now >= state.startedAt;
}
