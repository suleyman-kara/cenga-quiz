import { useState, type ReactNode } from "react";
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
  if (state === undefined) body = <p className="muted center">{t("common.loading")}</p>;
  else if (state === null)
    body = (
      <div className="card center stack">
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
            <h1 className="headline">{t("player.lobbyTitle")}</h1>
            <p className="name-badge">{session.name}</p>
            <p className="lead">{t("player.lobbyHint")}</p>
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

  if (!question) return <p className="muted center">{t("common.loading")}</p>;

  const choose = (i: number) => {
    if (picked !== null || timeUp) return;
    setPicked(i);
    markAnswered(pin, state.qIndex, i);
    submitAnswer(pin, state.qIndex, i).catch((err: Error) =>
      setError(t("common.error", { message: err.message })),
    );
  };

  return (
    <div className="player-question stack">
      <div className="player-question__top">
        <span className="chip">{t("player.questionN", { n: state.qIndex + 1 })}</span>
        <Countdown endsAt={state.endsAt} totalSeconds={question.seconds} serverNow={now} />
      </div>
      <h1 className="player-question__text">{question.text}</h1>
      {picked !== null ? (
        <p className="status status--locked" role="status">
          <ChoiceShape index={picked} />
          <span>
            <strong>{t("player.answerLocked")}</strong>
            <br />
            {t("player.waitReveal")}
          </span>
        </p>
      ) : (
        timeUp && (
          <p className="status" role="status">
            {t("player.timeUp")}
          </p>
        )
      )}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <div className="choice-grid" data-count={question.options.length}>
        {question.options.map((opt, i) => (
          <ChoiceButton
            key={i}
            index={i}
            text={opt}
            onSelect={choose}
            disabled={picked !== null || timeUp}
            selected={picked === i}
          />
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
  if (!score) return <p className="muted center">{t("common.loading")}</p>;
  const verdict = !score.lastAnswered ? "noAnswer" : score.lastCorrect ? "correct" : "wrong";
  const correctText =
    reveal && question && question.index === reveal.qIndex ? question.options[reveal.correct] : undefined;
  return (
    <div className={`verdict verdict--${verdict} center stack`}>
      <h1 className="headline">
        {t(verdict === "correct" ? "player.correct" : verdict === "wrong" ? "player.wrong" : "player.noAnswer")}
      </h1>
      <p className="verdict__points">{t("player.points", { points: score.lastDelta })}</p>
      {score.lastCorrect && score.streak >= 2 && <p className="chip chip--accent">{t("player.streak", { streak: score.streak })}</p>}
      {!score.lastCorrect && correctText !== undefined && reveal && (
        <p className="verdict__answer">
          <ChoiceShape index={reveal.correct} />
          <span>{t("player.correctWas", { answer: correctText })}</span>
        </p>
      )}
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
  if (!score) return <p className="muted center">{t("common.loading")}</p>;
  return (
    <div className="rank center stack">
      <h1 className="headline">{t("player.rank", { rank: score.rank })}</h1>
      {leaderboard && <p className="muted">{t("player.ofPlayers", { count: leaderboard.playerCount })}</p>}
      <p className="big-number">{t("player.score", { score: score.score })}</p>
    </div>
  );
}

function EndedView({ score, onLeave }: { score: PlayerScore | null | undefined; onLeave: () => void }) {
  const final = club.finalScreen[club.locale];
  return (
    <div className="ended center stack">
      {score && <p className="big-number">{t("player.finalRank", { rank: score.rank })}</p>}
      {score && <p className="muted">{t("player.score", { score: score.score })}</p>}
      <h1 className="headline">{final.title}</h1>
      <p className="lead">{final.message}</p>
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
