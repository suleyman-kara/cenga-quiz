/**
 * Shared contract between web client, Cloud Functions, Security Rules and tests.
 * Pure types only — no runtime imports.
 *
 * ── Realtime Database (live game only) ─────────────────────────────────────
 * games/{pin}/
 *   meta:                 GameMeta                (Functions write; any signed-in user reads)
 *   state:                GameState               (Functions write; any signed-in user reads)
 *   question:             PublicQuestion          (Functions write; NO correct answer; host + joined players read)
 *   reveal:               RevealData              (Functions write; host + joined players read)
 *   players/{uid}:        PlayerEntry             (player creates own once / deletes own, only in an unlocked,
 *                                                  not-full lobby and while state.lock is absent; never renamed
 *                                                  by the client — the join trigger may rename it right after
 *                                                  the join (blocked → "Oyuncu N", duplicate → " (2)"), so
 *                                                  clients show players/{uid}/name, not what they typed;
 *                                                  host reads all)
 *   answers/{qIndex}/{uid}: AnswerEntry           (player writes own once, startedAt <= now < endsAt, no lock;
 *                                                  host reads; player reads own)
 *   scores/{uid}:         PlayerScore             (Functions write; player reads own; host reads all)
 *   leaderboard:          Leaderboard             (Functions write; top N only; host + joined players read)
 *   banned/{uid}:         true                    (Functions write on kick; that uid + host read)
 *
 * ── Firestore ──────────────────────────────────────────────────────────────
 * allowedHosts/{email}    { addedAt }             (admin/console/script only; user may read own)
 * quizzes/{quizId}        QuizDoc                 (owner only; contains correct answers)
 * liveGames/{pin}         LiveGameDoc             (Functions only — private quiz snapshot)
 * gameResults/{pin}_{meta.createdAt}  GameResultDoc  (Functions write, idempotent set(); host owner reads)
 */

export type Phase = "lobby" | "question" | "reveal" | "leaderboard" | "ended";

// ---------- Quiz (authoring / Firestore) ----------
export interface QuizQuestion {
  text: string;
  /** 2..4 options */
  options: string[];
  /** index into options */
  correct: number;
  /** 5..120; falls back to club.game.defaultQuestionSeconds */
  seconds?: number;
  imageUrl?: string;
}

export interface Quiz {
  title: string;
  description?: string;
  questions: QuizQuestion[];
}

export interface QuizDoc extends Quiz {
  ownerUid: string;
  createdAt: number;
  updatedAt: number;
}

export interface LiveGameDoc {
  pin: string;
  hostUid: string;
  quizId: string;
  quiz: Quiz;
  createdAt: number;
}

export interface GameResultDoc {
  pin: string;
  hostUid: string;
  quizId: string;
  title: string;
  createdAt: number;
  endedAt: number;
  playerCount: number;
  questionCount: number;
  /**
   * Deletion time for the Firestore TTL policy (endedAt + club.game.resultsRetentionDays).
   * Written as a Date; read back by the client SDK as a Firestore Timestamp.
   */
  expireAt: Date | { seconds: number; nanoseconds: number; toMillis(): number };
  /** sorted by rank */
  results: { uid: string; name: string; score: number; rank: number; correctCount: number }[];
}

// ---------- RTDB live game ----------
export interface GameMeta {
  hostUid: string;
  quizId: string;
  title: string;
  createdAt: number;
  questionCount: number;
  /** host closed the lobby: new joins are rejected (rules) */
  locked?: boolean;
  /** set once the result is safely in Firestore gameResults/{pin}_{createdAt} */
  archived?: boolean;
  /**
   * Players currently in the room, maintained by the join/leave database triggers (eventually
   * consistent: lags a join by the trigger's latency; absent until the first join).
   */
  playerCount?: number;
  /** playerCount >= club.game.maxPlayers: new joins are rejected (rules). Set/cleared by the triggers. */
  full?: boolean;
  /**
   * server ms of the last lobby activity (latest join, lock/unlock, kick). Cleanup treats a room
   * as idle from max(state.updatedAt, lastActivityAt).
   */
  lastActivityAt?: number;
}

/** Host action currently holding the state lock (see GameState.lock). */
export type LockAction = "start" | "reveal" | "showLeaderboard" | "next" | "end" | "kick";

/**
 * Server-only transition lock. While present (and fresher than ~30 s) the room's inputs are
 * frozen: rules reject joins/leaves and answers. Removed by the transition's final write.
 */
export interface StateLock {
  by: LockAction;
  /** server ms when the lock was taken; older than 30 s = stale (crashed call), may be overridden */
  at: number;
}

export interface GameState {
  phase: Phase;
  /** -1 in lobby */
  qIndex: number;
  /**
   * server ms when the question clock starts; 0 when not in a question. During a question it is
   * club.game.leadInMs AFTER the question was published (updatedAt): show a "get ready" countdown
   * until startedAt — answers are rejected before it. Scoring uses answer.at - startedAt.
   */
  startedAt: number;
  endsAt: number;
  updatedAt: number;
  /** present only while a host transition is computing its result */
  lock?: StateLock;
}

export interface PublicQuestion {
  index: number;
  text: string;
  options: string[];
  seconds: number;
  imageUrl?: string;
  /** one of the last club.game.doublePointsLastN questions: points × 2 (absent otherwise) */
  double?: true;
}

export interface RevealData {
  qIndex: number;
  correct: number;
  /** counts[i] = how many players chose option i */
  counts: number[];
}

export interface PlayerEntry {
  name: string;
  /** must equal server time on write */
  joinedAt: number;
}

export interface AnswerEntry {
  choice: number;
  /** must equal server time on write (ServerValue.TIMESTAMP) */
  at: number;
}

export interface PlayerScore {
  score: number;
  /** consecutive correct answers ending at the last revealed question */
  streak: number;
  /** 1-based competition rank (ties share rank) */
  rank: number;
  /** rank before the last revealed question (absent when unknown, e.g. after the first question) */
  prevRank?: number;
  /** points gained on the last revealed question (incl. streak bonus) */
  lastDelta: number;
  lastCorrect: boolean;
  /** whether the player answered the last revealed question */
  lastAnswered: boolean;
  correctCount: number;
  /** name of the nearest player with a strictly higher score (absent for leaders) */
  aheadName?: string;
  /** points behind aheadName */
  aheadGap?: number;
  /** leaders only: points ahead of the next lower score (absent when nobody is below) */
  leadGap?: number;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  rank: number;
  /** correct answers so far (detailed lists); optional for older rooms */
  correctCount?: number;
  /** rank before the last scored question (absent when unknown) — movement arrows */
  prevRank?: number;
  /** current streak of consecutive correct answers (absent when 0) */
  streak?: number;
}

export interface Leaderboard {
  top: LeaderboardEntry[];
  playerCount: number;
}

// ---------- Callable function contract (region europe-west1) ----------
/**
 * Every host action goes through ONE callable, `host` (HOST_CALLABLE), so a single warm
 * instance serves the whole event. Request: `{ action, ...HostActionMap[action]["req"] }`.
 *
 * reveal / showLeaderboard / nextQuestion carry `qIndex` = the question the host screen is on
 * (for nextQuestion: the question being left). If the room already moved past that step the call
 * succeeds with `already: true` (duplicate click / retry); a qIndex ahead of the room →
 * failed-precondition. endGame on an ended room → `{ ok, already: true, resultId }`.
 *
 * kickPlayer / kickPlayers take the same state lock as the transitions. While another host step
 * holds it they fail with failed-precondition "Başka bir işlem sürüyor, lütfen tekrar deneyin."
 * — retry shortly. kickPlayers takes 1..100 uids.
 */
export interface HostActionMap {
  createGame: { req: { quizId: string }; res: { pin: string } };
  startGame: { req: { pin: string }; res: { ok: true } };
  reveal: { req: { pin: string; qIndex: number }; res: { ok: true; already?: true } };
  showLeaderboard: { req: { pin: string; qIndex: number }; res: { ok: true; already?: true } };
  nextQuestion: { req: { pin: string; qIndex: number }; res: { ok: true; already?: true } };
  endGame: { req: { pin: string }; res: { ok: true; resultId: string; already?: true } };
  kickPlayer: { req: { pin: string; uid: string }; res: { ok: true } };
  kickPlayers: { req: { pin: string; uids: string[] }; res: { ok: true } };
  setLobbyLocked: { req: { pin: string; locked: boolean }; res: { ok: true; locked: boolean } };
}
export type HostAction = keyof HostActionMap;
export const HOST_ACTIONS: readonly HostAction[] = [
  "createGame",
  "startGame",
  "reveal",
  "showLeaderboard",
  "nextQuestion",
  "endGame",
  "kickPlayer",
  "kickPlayers",
  "setLobbyLocked",
];
export type HostRequest<A extends HostAction = HostAction> = A extends HostAction
  ? { action: A } & HostActionMap[A]["req"]
  : never;
export type HostResponse<A extends HostAction = HostAction> = HostActionMap[A]["res"];

export const HOST_CALLABLE = "host";

export interface CallableContract {
  host: { req: HostRequest; res: HostResponse };
}
export type CallableName = keyof CallableContract;

export const FUNCTIONS_REGION = "europe-west1";

// ---------------------------------------------------------------------------
// Host e-mail sign-up pre-check (callable `checkHostEmail`, works signed out).
// Answers only whether ONE address is on the allow-list; the list never leaves the server.
// ---------------------------------------------------------------------------

export const CHECK_HOST_EMAIL_CALLABLE = "checkHostEmail";
export interface CheckHostEmailRequest {
  email: string;
}
export interface CheckHostEmailResponse {
  allowed: boolean;
}
