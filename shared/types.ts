/**
 * Shared contract between web client, Cloud Functions, Security Rules and tests.
 * Pure types only — no runtime imports.
 *
 * ── Realtime Database (live game only) ─────────────────────────────────────
 * games/{pin}/
 *   meta:                 GameMeta                (Functions write; any signed-in user reads)
 *   state:                GameState               (Functions write; any signed-in user reads)
 *   question:             PublicQuestion          (Functions write; NO correct answer)
 *   reveal:               RevealData              (Functions write)
 *   players/{uid}:        PlayerEntry             (player writes own, only in lobby; host reads all)
 *   answers/{qIndex}/{uid}: AnswerEntry           (player writes own once; host reads; player reads own)
 *   scores/{uid}:         PlayerScore             (Functions write; player reads own; host reads all)
 *   leaderboard:          Leaderboard             (Functions write; top N only)
 *
 * ── Firestore ──────────────────────────────────────────────────────────────
 * allowedHosts/{email}    { addedAt }             (admin/console/script only; user may read own)
 * quizzes/{quizId}        QuizDoc                 (owner only; contains correct answers)
 * liveGames/{pin}         LiveGameDoc             (Functions only — private quiz snapshot)
 * gameResults/{gameId}    GameResultDoc           (Functions write; host owner reads)
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
}

export interface GameState {
  phase: Phase;
  /** -1 in lobby */
  qIndex: number;
  /** server ms; 0 when not in a question */
  startedAt: number;
  endsAt: number;
  updatedAt: number;
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
}
export type CallableName = keyof CallableContract;

export const FUNCTIONS_REGION = "europe-west1";
