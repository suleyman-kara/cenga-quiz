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
 *   players/{uid}:        PlayerEntry             (player creates own once / deletes own, only in an unlocked
 *                                                  lobby and while state.lock is absent; never renamed by the
 *                                                  client; host reads all)
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
}

/** Host action currently holding the state lock (see GameState.lock). */
export type LockAction = "start" | "reveal" | "showLeaderboard" | "next" | "end";

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
  /** server ms; 0 when not in a question */
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
  /** points gained on the last revealed question (incl. streak bonus) */
  lastDelta: number;
  lastCorrect: boolean;
  /** whether the player answered the last revealed question */
  lastAnswered: boolean;
  correctCount: number;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  rank: number;
}

export interface Leaderboard {
  top: LeaderboardEntry[];
  playerCount: number;
}

// ---------- Callable function contract (region europe-west1) ----------
export interface CallableContract {
  createGame: { req: { quizId: string }; res: { pin: string } };
  startGame: { req: { pin: string }; res: { ok: true } };
  reveal: { req: { pin: string }; res: { ok: true } };
  showLeaderboard: { req: { pin: string }; res: { ok: true } };
  nextQuestion: { req: { pin: string }; res: { ok: true } };
  endGame: { req: { pin: string }; res: { ok: true; resultId: string } };
  kickPlayer: { req: { pin: string; uid: string }; res: { ok: true } };
  setLobbyLocked: { req: { pin: string; locked: boolean }; res: { ok: true; locked: boolean } };
}
export type CallableName = keyof CallableContract;

export const FUNCTIONS_REGION = "europe-west1";
