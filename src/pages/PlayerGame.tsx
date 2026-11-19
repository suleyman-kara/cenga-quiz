import { useState, type CSSProperties, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type { GameState, Leaderboard, PlayerScore, PublicQuestion, RevealData } from "../../shared/types";
import {
  useGameState,
  useLeaderboard,
  useMyScore,
  usePlayerUid,
  useQuestion,
  useReveal,
  useServerNow,
} from "../game/hooks";
import { submitAnswer } from "../game/actions";
import { answeredChoice, clearSession, loadSession, markAnswered } from "../game/session";
import { Layout } from "../components/Layout";
import { ChoiceButton } from "../components/ChoiceButton";
import { ChoiceShape } from "../components/ChoiceShape";
import { Countdown, remaining } from "../components/Countdown";
import { Loading } from "../components/Loading";
import { StreakBadge } from "../components/StreakBadge";
import { club } from "../club.config";
import { t } from "../i18n";

/**
 * Player screen. Subscribes ONLY to state, question, reveal, leaderboard and
 * the player's own score (see TRAFFIC RULE in game/hooks.ts).
 */
export function PlayerGame() {
  const { pin = "" } = useParams();
  const navigate = useNavigate();
  const session = loadSession();
  const uid = usePlayerUid();
  const state = useGameState(pin);
  const question = useQuestion(pin);
  const reveal = useReveal(pin);
  const leaderboard = useLeaderboard(pin);
  const score = useMyScore(pin, uid);
  const now = useServerNow();

  if (!session || session.pin !== pin) return <Navigate to={`/?pin=${pin}`} replace />;

  const leave = () => {
    clearSession();
    navigate("/", { replace: true });
  };

  let body: ReactNode;
  if (state === undefined) body = <Loading variant="text" />;
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
              <p className="name-badge">{session.name}</p>
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
          />
        );
        break;
      case "reveal":
        body = <RevealView score={score} reveal={reveal} question={question} />;
        break;
      case "leaderboard":
        body = <RankView score={score} leaderboard={leaderboard} />;
        break;
      case "ended":
        body = <EndedView score={score} onLeave={leave} />;
        break;
    }

  return (
    <Layout
      aside={
        state?.phase === "lobby" ? (
          <span className="chip">{t("join.pinChip", { pin })}</span>
        ) : (
          <span className="chip">{session.name}</span>
        )
      }
    >
      <section className="player">{body}</section>
    </Layout>
  );
}

function QuestionView({
  pin,
  state,
  question,
  now,
}: {
  pin: string;
  state: GameState;
  question: PublicQuestion | null;
  now: number;
}) {
  const [picked, setPicked] = useState<number | null>(() => answeredChoice(pin, state.qIndex));
  const [error, setError] = useState<string | null>(null);
  const timeUp = remaining(state.endsAt, now) === 0;

  if (!question) return <Loading />;

  const choose = (i: number) => {
    if (picked !== null || timeUp) return;
    setPicked(i);
    markAnswered(pin, state.qIndex, i);
    submitAnswer(pin, state.qIndex, i).catch((err: Error) => setError(t("common.error", { message: err.message })));
  };

  const locked = picked !== null || timeUp;
  return (
    <div className="player-question" data-locked={locked || undefined}>
      <div className="player-question__top">
        <span className="chip">{t("player.questionN", { n: state.qIndex + 1 })}</span>
        <Countdown endsAt={state.endsAt} totalSeconds={question.seconds} serverNow={now} />
      </div>
      <h1 className="player-question__text">{question.text}</h1>
      {picked !== null ? (
        <div className="locked" data-choice={picked} role="status">
          <span className="locked__shape" aria-hidden="true">
            <ChoiceShape index={picked} />
          </span>
          <p className="locked__title">{t("player.answerLocked")}</p>
          <p className="locked__choice">{question.options[picked]}</p>
          <p className="locked__hint">{t("player.waitReveal")}</p>
        </div>
      ) : (
        timeUp && (
          <div className="locked locked--timeup" role="status">
            <svg className="locked__clock" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.5 2.5M10 2h4" />
            </svg>
            <p className="locked__title">{t("player.timeUp")}</p>
          </div>
        )
      )}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <div className="choice-grid" data-count={question.options.length} data-locked={locked || undefined}>
        {question.options.map((opt, i) => (
          <ChoiceButton key={i} index={i} text={opt} onSelect={choose} disabled={locked} selected={picked === i} />
        ))}
      </div>
    </div>
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
  if (!score) return <Loading variant="text" />;
  const verdict = !score.lastAnswered ? "noAnswer" : score.lastCorrect ? "correct" : "wrong";
  const correctText =
    reveal && question && question.index === reveal.qIndex ? question.options[reveal.correct] : undefined;
  const pointsText = t("player.points", { points: score.lastDelta });
  // split "+{points} puan" around the number so the number can count up in CSS
  const [before = "", after = ""] = t("player.points", { points: "\u0000" }).split("\u0000");
  return (
    <div className={`verdict verdict--${verdict} center`}>
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
      {score.lastCorrect && score.streak >= 2 && <StreakBadge streak={score.streak} />}
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
      {score.streak >= 2 && <StreakBadge streak={score.streak} />}
    </div>
  );
}

function EndedView({ score, onLeave }: { score: PlayerScore | null | undefined; onLeave: () => void }) {
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
