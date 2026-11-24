import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type { GameState, Leaderboard, PlayerScore, PublicQuestion, RevealData } from "../../shared/types";
import {
  useBanned,
  useGameState,
  useLeaderboard,
  useMyPlayer,
  useMyScore,
  usePlayerUid,
  useQuestion,
  useReveal,
  useServerNow,
} from "../game/hooks";
import { fetchOwnAnswer, submitAnswer } from "../game/actions";
import { useConnectionLost } from "../game/connection";
import { answeredChoice, clearSession, finishSession, loadSession, markAnswered } from "../game/session";
import { useWakeLock } from "../host/useWakeLock";
import { isPermissionDenied } from "../errors";
import { Layout } from "../components/Layout";
import { ChoiceButton } from "../components/ChoiceButton";
import { ChoiceShape } from "../components/ChoiceShape";
import { Countdown, remaining, remainingSeconds } from "../components/Countdown";
import { Loading } from "../components/Loading";
import { StreakBadge } from "../components/StreakBadge";
import { GapLine, MoveLine } from "../components/GapLine";
import { DoubleBadge } from "../components/DoubleBadge";
import { Leaderboard as LeaderboardList, isHotStreak } from "../components/Leaderboard";
import { Confetti } from "../components/Confetti";
import { club } from "../club.config";
import { t } from "../i18n";

/**
 * Player screen. Subscribes ONLY to state, question, reveal, leaderboard and
 * the player's own score / player entry / banned flag (see TRAFFIC RULE in game/hooks.ts).
 */
export function PlayerGame() {
  const { pin = "" } = useParams();
  const navigate = useNavigate();
  const session = loadSession(pin);
  const uid = usePlayerUid();
  const state = useGameState(pin);
  const question = useQuestion(pin);
  const reveal = useReveal(pin);
  const leaderboard = useLeaderboard(pin);
  const score = useMyScore(pin, uid);
  const me = useMyPlayer(pin, uid);
  const banned = useBanned(pin, uid);
  const lost = useConnectionLost();
  const now = useServerNow();

  // Kicked (banned/{uid}) or dropped by the server at start (capacity): own entry is gone.
  const removed = banned === true || (me === null && !!state && state.phase !== "ended");
  const over = state === null || state?.phase === "ended";
  // a locked phone drops the realtime connection: keep the screen on while the game runs
  useWakeLock(!!session && !!state && !over && !removed);
  // a finished game must not capture the next visit to the join screen
  useEffect(() => {
    if (over) finishSession(pin);
  }, [over, pin]);

  if (!session) return <Navigate to={`/?pin=${pin}`} replace />;

  const leave = () => {
    clearSession(pin);
    navigate("/", { replace: true });
  };

  const name = me?.name ?? session.name;
  const computing = !!state?.lock && state.lock.at > now - 30_000;

  let body: ReactNode;
  if (state === undefined) body = <Loading variant="text" />;
  else if (removed)
    body = (
      <div className="card center stack gone" role="status">
        <p className="lead">{t("player.kicked")}</p>
        <button type="button" className="btn btn--primary" onClick={leave}>
          {t("player.backToJoin")}
        </button>
      </div>
    );
  else if (state === null)
    body = (
      <div className="card center stack gone">
        <p className="lead">{t("player.gameGone")}</p>
        <button type="button" className="btn btn--primary" onClick={leave}>
          {t("player.backToJoin")}
        </button>
      </div>
    );
  else
    switch (state.phase) {
      case "lobby":
        body = (
          <div className="player-lobby center stack">
            <div className="orbit">
              <span className="orbit__ring" aria-hidden="true">
                {club.choices.map((c, i) => (
                  <span key={c.id} className="orbit__item" data-choice={i} style={{ "--i": i } as CSSProperties}>
                    <ChoiceShape index={i} />
                  </span>
                ))}
              </span>
              <p className="name-badge">{name}</p>
            </div>
            <h1 className="headline">{t("player.lobbyTitle")}</h1>
            <p className="lead muted">{t("player.lobbyHint")}</p>
            <span className="wait-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </div>
        );
        break;
      case "question":
        body = (
          <QuestionView
            key={state.qIndex}
            pin={pin}
            state={state}
            question={question?.index === state.qIndex ? question : null}
            now={now}
            lost={lost}
          />
        );
        break;
      case "reveal":
        body = (
          <>
            <VerdictCelebration score={score} />
            <RevealView score={score} reveal={reveal} question={question} />
          </>
        );
        break;
      case "leaderboard":
        body = <RankView score={score} leaderboard={leaderboard} />;
        break;
      case "ended":
        body = <EndedView score={score} leaderboard={leaderboard} onLeave={leave} />;
        break;
    }

  return (
    <Layout
      offline={lost}
      aside={
        state?.phase === "lobby" ? (
          <span className="chip">{t("join.pinChip", { pin })}</span>
        ) : (
          <span className="chip">{name}</span>
        )
      }
    >
      <section className="player">
        {computing && !removed && (
          <p className="computing" role="status">
            {t("common.computing")}
          </p>
        )}
        <span className="sr-only" aria-live="polite" data-phase-announcer>
          {state?.phase === "question" && !removed && question?.index === state.qIndex
            ? `${t("player.questionN", { n: state.qIndex + 1 })}: ${question.text}`
            : ""}
        </span>
        {body}
      </section>
    </Layout>
  );
}

type Submission =
  | { kind: "idle" }
  | { kind: "sending"; choice: number }
  | { kind: "sent"; choice: number }
  | { kind: "failed" }
  | { kind: "rejected" };

/** A write neither confirmed nor refused after this long is checked against the server. */
export const SEND_VERIFY_MS = 8000;

/** PERMISSION_DENIED within the last second is the deadline (clock skew), not a retryable glitch. */
function isTooLate(err: unknown, state: GameState, now: number): boolean {
  return isPermissionDenied(err) && state.endsAt - now < 1000;
}

/** Screen-reader announcement only at 10 and 5 seconds left (not every tick). */
function announcement(secs: number): string {
  if (secs <= 0 || secs > 10) return "";
  return t("player.secondsLeft", { seconds: secs <= 5 ? 5 : 10 });
}

function QuestionView({
  pin,
  state,
  question,
  now,
  lost,
}: {
  pin: string;
  state: GameState;
  question: PublicQuestion | null;
  now: number;
  /** realtime connection dropped: writes are queued by the SDK and sent on reconnect */
  lost: boolean;
}) {
  const [sub, setSub] = useState<Submission>(() => {
    const prev = answeredChoice(pin, state.qIndex);
    return prev === null ? { kind: "idle" } : { kind: "sent", choice: prev };
  });
  // bumped after a failed send so the ChoiceButtons remount (their fired-once guard resets)
  const [attempt, setAttempt] = useState(0);
  const nowRef = useRef(now);
  nowRef.current = now;
  const lostRef = useRef(lost);
  lostRef.current = lost;
  const alive = useRef(true);
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      // A new question/phase while pending: the answer counts as not sent (nothing persisted).
      alive.current = false;
      clearTimeout(verifyTimer.current);
    };
  }, []);

  /** Asks the server whether our answer is recorded; if so, shows it as sent. Resolves to found. */
  const verify = async (): Promise<boolean> => {
    let choice: number | null = null;
    try {
      choice = await fetchOwnAnswer(pin, state.qIndex);
    } catch {
      return false;
    }
    if (choice === null) return false;
    markAnswered(pin, state.qIndex, choice);
    if (alive.current) setSub({ kind: "sent", choice });
    return true;
  };

  // Reloaded before markAnswered ran (or storage unavailable): the server may still have it.
  useEffect(() => {
    if (answeredChoice(pin, state.qIndex) !== null) return;
    void fetchOwnAnswer(pin, state.qIndex)
      .then((choice) => {
        if (choice === null || !alive.current) return;
        markAnswered(pin, state.qIndex, choice);
        setSub((cur) => (cur.kind === "sent" ? cur : { kind: "sent", choice }));
      })
      .catch(() => undefined);
  }, []);

  const leadIn = now < state.startedAt;
  const timeUp = remaining(state.endsAt, now) === 0;

  if (!question) return <Loading />;

  const busy = sub.kind === "sending" || sub.kind === "sent" || sub.kind === "rejected";
  const failedOrRejected = (err: unknown) => {
    // Past endsAt (typically PERMISSION_DENIED from the rules): the answer was not received.
    if (remaining(state.endsAt, nowRef.current) === 0 || isTooLate(err, state, nowRef.current)) {
      setSub({ kind: "rejected" });
    } else {
      setSub({ kind: "failed" });
      setAttempt((a) => a + 1);
    }
  };
  const choose = (i: number) => {
    if (busy || timeUp || leadIn) return;
    setSub({ kind: "sending", choice: i });
    navigator.vibrate?.(30);
    let settled = false;
    let waitedOffline = false;
    clearTimeout(verifyTimer.current);
    // While offline the SDK keeps the write queued and sends it on reconnect: wait for the
    // connection instead of failing, then give the write the usual time to be confirmed.
    const arm = (ms: number) => {
      verifyTimer.current = setTimeout(() => {
        if (settled || !alive.current) return;
        if (lostRef.current) {
          waitedOffline = true;
          arm(1000);
          return;
        }
        if (waitedOffline) {
          waitedOffline = false;
          arm(SEND_VERIFY_MS);
          return;
        }
        void verify().then((found) => {
          if (!found && !settled && alive.current) failedOrRejected(null);
        });
      }, ms);
    };
    arm(SEND_VERIFY_MS);
    submitAnswer(pin, state.qIndex, i).then(
      () => {
        settled = true;
        clearTimeout(verifyTimer.current);
        // Only a write the server accepted counts as answered.
        markAnswered(pin, state.qIndex, i);
        if (alive.current) setSub({ kind: "sent", choice: i });
      },
      async (err: unknown) => {
        settled = true;
        clearTimeout(verifyTimer.current);
        if (!alive.current) return;
        // The write-once rule also denies a resend of an answer the server already accepted.
        if (isPermissionDenied(err) && (await verify())) return;
        if (alive.current) failedOrRejected(err);
      },
    );
  };

  const locked = busy || timeUp || leadIn;
  const picked = sub.kind === "sending" || sub.kind === "sent" ? sub.choice : null;
  const secs = remainingSeconds(state.endsAt, now);
  return (
    <div
      className="player-question"
      data-locked={locked || undefined}
      data-leadin={leadIn || undefined}
      data-double={question.double || undefined}
    >
      {/* 2× questions: a soft pulsing tint around the screen edge (decorative) */}
      {question.double && <span className="double-edge" aria-hidden="true" />}
      <div className="player-question__top">
        <span className="chip">{t("player.questionN", { n: state.qIndex + 1 })}</span>
        {question.double && <DoubleBadge className="double-badge--phone" />}
        {!leadIn && <Countdown endsAt={state.endsAt} totalSeconds={question.seconds} serverNow={now} />}
      </div>
      <span className="sr-only" aria-live="polite" data-countdown-announcer>
        {leadIn ? "" : announcement(secs)}
      </span>
      <h1 className="player-question__text">{question.text}</h1>
      {leadIn ? (
        <div className="getready" role="status">
          <p className="getready__title">{t("player.getReady")}</p>
          <p className="getready__num" aria-hidden="true">
            {remainingSeconds(state.startedAt, now)}
          </p>
        </div>
      ) : sub.kind === "sending" && picked !== null ? (
        <div className="locked locked--sending" data-choice={picked} role="status">
          <span className="locked__spinner" aria-hidden="true" />
          <p className="locked__title">{t(lost ? "player.sendingOffline" : "player.sending")}</p>
          <p className="locked__choice">{question.options[picked]}</p>
        </div>
      ) : sub.kind === "sent" && picked !== null ? (
        <div className="locked" data-choice={picked} role="status">
          <span className="locked__shape" aria-hidden="true">
            <ChoiceShape index={picked} />
          </span>
          <p className="locked__title">{t("player.answerLocked")}</p>
          <p className="locked__choice">{question.options[picked]}</p>
          <p className="locked__hint">{t("player.waitReveal")}</p>
        </div>
      ) : (
        (timeUp || sub.kind === "rejected") && (
          <div className="locked locked--timeup" role="status">
            <svg className="locked__clock" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.5 2.5M10 2h4" />
            </svg>
            <p className="locked__title">{t(sub.kind === "rejected" ? "player.answerRejected" : "player.timeUp")}</p>
          </div>
        )
      )}
      {lost && !leadIn && !timeUp && (sub.kind === "idle" || sub.kind === "failed") && (
        <p className="offline-hint" role="status">
          {t("player.offlineAnswerHint")}
        </p>
      )}
      {sub.kind === "failed" && !timeUp && !lost && (
        <p className="field__error" role="alert">
          {t("player.sendFailed")}
        </p>
      )}
      {/* options appear only once answering opens (not during the "get ready" lead-in) */}
      {!leadIn && (
        <div className="choice-grid choice-grid--in" data-count={question.options.length} data-locked={locked || undefined}>
          {question.options.map((opt, i) => (
            <ChoiceButton
              key={`${attempt}-${i}`}
              index={i}
              text={opt}
              onSelect={choose}
              disabled={locked}
              selected={picked === i}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Phones: a short double buzz when correct, one longer buzz when wrong (once per question). */
function useVerdictBuzz(verdict: "correct" | "wrong" | "noAnswer", qIndex: number | undefined) {
  const done = useRef<number | null>(null);
  useEffect(() => {
    if (qIndex === undefined || verdict === "noAnswer" || done.current === qIndex) return;
    done.current = qIndex;
    navigator.vibrate?.(verdict === "correct" ? [35, 60, 35] : 160);
  }, [verdict, qIndex]);
}

/**
 * Correct answer: a full-screen colour flash plus shape confetti. Rendered beside (not inside)
 * .verdict, whose entry transform would otherwise confine these fixed layers to its box.
 */
function VerdictCelebration({ score }: { score: PlayerScore | null | undefined }) {
  if (!score?.lastAnswered || !score.lastCorrect) return null;
  return (
    <>
      <span className="verdict-flash" aria-hidden="true" />
      <Confetti count={18} startMs={250} loops={1} className="confetti--phone" />
    </>
  );
}

function RevealView({
  score,
  reveal,
  question,
}: {
  score: PlayerScore | null | undefined;
  reveal: RevealData | null | undefined;
  question: PublicQuestion | null | undefined;
}) {
  useVerdictBuzz(!score?.lastAnswered ? "noAnswer" : score.lastCorrect ? "correct" : "wrong", reveal?.qIndex);
  if (!score) return <Loading variant="text" />;
  const verdict = !score.lastAnswered ? "noAnswer" : score.lastCorrect ? "correct" : "wrong";
  const correctText =
    reveal && question && question.index === reveal.qIndex ? question.options[reveal.correct] : undefined;
  const pointsText = t("player.points", { points: score.lastDelta });
  // split "+{points} puan" around the number so the number can count up in CSS
  const [before = "", after = ""] = t("player.points", { points: "\u0000" }).split("\u0000");
  const hot = score.lastCorrect && isHotStreak(score.streak);
  return (
    <div className={`verdict verdict--${verdict} center`} role="status" data-hot={hot || undefined}>
      <span className="verdict__icon" aria-hidden="true">
        {verdict === "correct" && (
          <span className="verdict__burst">
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                className="verdict__spark"
                data-choice={i % club.choices.length}
                style={{ "--i": i } as CSSProperties}
              >
                <ChoiceShape index={i % club.choices.length} />
              </span>
            ))}
          </span>
        )}
        <svg viewBox="0 0 24 24" focusable="false">
          {verdict === "correct" ? (
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          ) : verdict === "wrong" ? (
            <path d="M7 7l10 10M17 7L7 17" />
          ) : (
            <>
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.5 2.5M10 2h4" />
            </>
          )}
        </svg>
      </span>
      <h1 className="headline">
        {t(verdict === "correct" ? "player.correct" : verdict === "wrong" ? "player.wrong" : "player.noAnswer")}
      </h1>
      <p className="verdict__points">
        <span className="sr-only">{pointsText}</span>
        <span className="countup" aria-hidden="true" style={{ "--to": score.lastDelta } as CSSProperties}>
          {before}
          <span className="countup__n" />
          <span className="countup__unit">{after}</span>
        </span>
      </p>
      {score.lastCorrect && score.streak >= 2 && <StreakBadge streak={score.streak} hot={hot} />}
      {!score.lastCorrect && correctText !== undefined && reveal && (
        <p className="verdict__answer" data-choice={reveal.correct}>
          <ChoiceShape index={reveal.correct} />
          <span>{t("player.correctWas", { answer: correctText })}</span>
        </p>
      )}
      <div className="verdict__stats">
        <p>{t("player.rank", { rank: score.rank })}</p>
        <p>{t("player.score", { score: score.score })}</p>
      </div>
      <MoveLine score={score} />
      <GapLine score={score} />
    </div>
  );
}

function RankView({
  score,
  leaderboard,
}: {
  score: PlayerScore | null | undefined;
  leaderboard: Leaderboard | null | undefined;
}) {
  if (!score) return <Loading variant="text" />;
  return (
    <div className="rank center stack">
      <span className="rank__medal" aria-hidden="true" data-top={score.rank <= 3 || undefined}>
        {score.rank}
      </span>
      <h1 className="headline">{t("player.rank", { rank: score.rank })}</h1>
      {leaderboard && <p className="muted">{t("player.ofPlayers", { count: leaderboard.playerCount })}</p>}
      <p className="rank__score">{t("player.score", { score: score.score })}</p>
      <MoveLine score={score} />
      <GapLine score={score} />
      {score.streak >= 2 && <StreakBadge streak={score.streak} hot={isHotStreak(score.streak)} />}
    </div>
  );
}

function EndedView({
  score,
  leaderboard,
  onLeave,
}: {
  score: PlayerScore | null | undefined;
  leaderboard: Leaderboard | null | undefined;
  onLeave: () => void;
}) {
  const final = club.finalScreen[club.locale];
  return (
    <div className="ended center stack">
      {score && (
        <div className="ended__result">
          <p className="ended__rank">{t("player.finalRank", { rank: score.rank })}</p>
          <p className="ended__score">{t("player.score", { score: score.score })}</p>
        </div>
      )}
      <h1 className="headline">{final.title}</h1>
      <p className="lead muted">{final.message}</p>
      {leaderboard && leaderboard.top.length > 0 && (
        <section className="ended__top">
          <h2 className="ended__top-title">{t("ended.topTitle", { count: club.game.leaderboardSize })}</h2>
          <LeaderboardList
            entries={leaderboard.top}
            limit={club.game.leaderboardSize}
            detailed
            label={t("ended.topTitle", { count: club.game.leaderboardSize })}
          />
        </section>
      )}
      <ul className="social">
        {club.social.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.label}
            </a>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--ghost" onClick={onLeave}>
        {t("player.backToJoin")}
      </button>
    </div>
  );
}
