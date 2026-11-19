import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import type { CallableName, GameMeta, GameState, PublicQuestion, RevealData } from "../../shared/types";
import {
  useAnswerCount,
  useGameState,
  useLeaderboard,
  useMeta,
  usePlayers,
  useQuestion,
  useReveal,
  useServerNow,
} from "../game/hooks";
import { HostGate } from "../host/HostGate";
import { useAutoReveal } from "../host/useAutoReveal";
import { Layout } from "../components/Layout";
import { Logo } from "../components/Logo";
import { ChoiceShape } from "../components/ChoiceShape";
import { Countdown, remaining } from "../components/Countdown";
import { Loading } from "../components/Loading";
import { Leaderboard } from "../components/Leaderboard";
import { Podium } from "../components/Podium";
import { club } from "../club.config";
import { call } from "../firebase";
import { t } from "../i18n";

export function HostGame() {
  const { pin = "" } = useParams();
  return <HostGate>{() => <BigScreen pin={pin} />}</HostGate>;
}

type PinAction = Exclude<CallableName, "createGame">;

function BigScreen({ pin }: { pin: string }) {
  const meta = useMeta(pin);
  const state = useGameState(pin);
  const question = useQuestion(pin);
  const reveal = useReveal(pin);
  const leaderboard = useLeaderboard(pin);
  const players = usePlayers(pin);
  const qIndex = state?.qIndex ?? -1;
  const answered = useAnswerCount(pin, qIndex);
  const now = useServerNow();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showError = useCallback((err: Error) => setError(t("common.error", { message: err.message })), []);

  const run = useCallback(
    async (name: PinAction) => {
      setBusy(true);
      setError(null);
      try {
        await call(name, { pin });
      } catch (err) {
        showError(err as Error);
      } finally {
        setBusy(false);
      }
    },
    [pin, showError],
  );

  const inQuestion = state?.phase === "question";
  const timeUp = inQuestion && !!state && state.endsAt > 0 && remaining(state.endsAt, now) === 0;
  const allAnswered = players.length > 0 && answered >= players.length;
  const doReveal = useCallback(() => call("reveal", { pin }), [pin]);
  const auto = useAutoReveal({
    qIndex,
    active: inQuestion,
    due: timeUp || allAnswered,
    reveal: doReveal,
    onError: showError,
  });

  let body: ReactNode;
  let controls: ReactNode = null;

  if (state === undefined) body = <Loading variant="text" />;
  else if (state === null)
    body = (
      <div className="center stack stage-missing">
        <p className="lead">{t("hostGame.notFound")}</p>
        <Link className="btn btn--primary" to="/host">
          {t("hostGame.backToPanel")}
        </Link>
      </div>
    );
  else
    switch (state.phase) {
      case "lobby":
        body = <LobbyStage pin={pin} meta={meta} names={players.map((p) => ({ id: p.uid, name: p.name }))} />;
        controls = (
          <button
            type="button"
            className="btn btn--primary btn--stage"
            disabled={busy || players.length === 0}
            onClick={() => void run("startGame")}
          >
            {t("hostGame.start")}
          </button>
        );
        break;
      case "question":
        body = (
          <QuestionStage
            state={state}
            meta={meta}
            question={question?.index === state.qIndex ? question : null}
            now={now}
            answered={answered}
            total={players.length}
          />
        );
        controls = (
          <button type="button" className="btn btn--primary btn--stage" disabled={auto.sent} onClick={auto.reveal}>
            {t("hostGame.reveal")}
          </button>
        );
        break;
      case "reveal":
        body = (
          <RevealStage
            state={state}
            meta={meta}
            question={question?.index === state.qIndex ? question : null}
            reveal={reveal?.qIndex === state.qIndex ? reveal : null}
          />
        );
        controls = (
          <button
            type="button"
            className="btn btn--primary btn--stage"
            disabled={busy}
            onClick={() => void run("showLeaderboard")}
          >
            {t("hostGame.showLeaderboard")}
          </button>
        );
        break;
      case "leaderboard": {
        const isLast = !!meta && state.qIndex >= meta.questionCount - 1;
        body = (
          <div className="stage-board stack">
            <QuestionHeader state={state} meta={meta} />
            <h1 className="stage-title">{t("leaderboard.title")}</h1>
            <Leaderboard entries={leaderboard?.top ?? []} limit={club.game.leaderboardSize} />
          </div>
        );
        controls = (
          <>
            {!isLast && (
              <button
                type="button"
                className="btn btn--primary btn--stage"
                disabled={busy}
                onClick={() => void run("nextQuestion")}
              >
                {t("hostGame.next")}
              </button>
            )}
            <button
              type="button"
              className={`btn btn--stage ${isLast ? "btn--primary" : "btn--ghost"}`}
              disabled={busy}
              onClick={() => void run("endGame")}
            >
              {t("hostGame.end")}
            </button>
          </>
        );
        break;
      }
      case "ended": {
        const final = club.finalScreen[club.locale];
        body = (
          <div className="stage-ended stack center">
            <Logo className="stage-ended__logo" />
            <Podium entries={leaderboard?.top ?? []} />
            <div className="stage-ended__text">
              <h1 className="stage-title">{final.title}</h1>
              <p className="stage-lead">{final.message}</p>
            </div>
          </div>
        );
        controls = (
          <Link className="btn btn--ghost btn--stage" to="/host">
            {t("hostGame.backToPanel")}
          </Link>
        );
        break;
      }
    }

  const ended = state?.phase === "ended";
  return (
    <Layout
      variant="stage"
      showLogo={!ended}
      aside={!ended && state ? <span className="chip chip--stage">{t("join.pinChip", { pin })}</span> : undefined}
    >
      <div className="stage">
        <div className="stage__body">{body}</div>
        {error && (
          <p className="stage__error" role="alert">
            {error}
          </p>
        )}
        {controls && <div className="stage__controls">{controls}</div>}
      </div>
    </Layout>
  );
}

function LobbyStage({
  pin,
  meta,
  names,
}: {
  pin: string;
  meta: GameMeta | null | undefined;
  names: { id: string; name: string }[];
}) {
  return (
    <div className="stage-lobby">
      <div className="stage-lobby__join">
        {meta && <p className="stage-lobby__title">{meta.title}</p>}
        <p className="stage-lobby__url">{t("hostGame.joinAt", { url: window.location.host })}</p>
        <div className="stage-lobby__ticket">
          <p className="stage-lobby__pin-label">{t("hostGame.pin")}</p>
          <p className="stage-lobby__pin">{pin}</p>
        </div>
      </div>
      <div className="stage-lobby__players">
        <p className="stage-lobby__count" aria-live="polite">
          {t("hostGame.players", { count: names.length })}
        </p>
        {names.length === 0 ? (
          <div className="stage-lobby__empty">
            <span className="shape-row" aria-hidden="true">
              {club.choices.map((c, i) => (
                <span
                  key={c.id}
                  className="shape-row__item stage-wait"
                  data-choice={i}
                  style={{ "--i": i } as CSSProperties}
                >
                  <ChoiceShape index={i} />
                </span>
              ))}
            </span>
            <p className="muted">{t("hostGame.waitingPlayers")}</p>
          </div>
        ) : (
          <ul className="name-grid">
            {names.map((p, i) => (
              <li key={p.id} data-choice={i % club.choices.length}>
                <ChoiceShape index={i % club.choices.length} />
                <span>{p.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function QuestionHeader({ state, meta }: { state: GameState; meta: GameMeta | null | undefined }) {
  return (
    <div className="stage-kicker">
      <p>
        {meta
          ? t("hostGame.questionOf", { n: state.qIndex + 1, total: meta.questionCount })
          : t("player.questionN", { n: state.qIndex + 1 })}
      </p>
      {meta && meta.questionCount > 1 && (
        <span className="stage-steps" aria-hidden="true">
          {Array.from({ length: meta.questionCount }, (_, i) => (
            <span key={i} data-done={i < state.qIndex || undefined} data-current={i === state.qIndex || undefined} />
          ))}
        </span>
      )}
    </div>
  );
}

function QuestionStage({
  state,
  meta,
  question,
  now,
  answered,
  total,
}: {
  state: GameState;
  meta: GameMeta | null | undefined;
  question: PublicQuestion | null;
  now: number;
  answered: number;
  total: number;
}) {
  if (!question) return <Loading />;
  const share = total > 0 ? Math.min(1, answered / total) : 0;
  return (
    <div className="stage-question">
      <div className="stage-question__head">
        <div>
          <QuestionHeader state={state} meta={meta} />
          <h1 className="stage-question__text">{question.text}</h1>
        </div>
        <Countdown endsAt={state.endsAt} totalSeconds={question.seconds} serverNow={now} size="lg" />
      </div>
      {question.imageUrl && <img className="stage-question__img" src={question.imageUrl} alt="" />}
      <ul className="stage-options" data-count={question.options.length}>
        {question.options.map((opt, i) => (
          <li key={i} className="stage-option" data-choice={i}>
            <ChoiceShape index={i} />
            <span>{opt}</span>
          </li>
        ))}
      </ul>
      <div className="stage-answered">
        <span className="stage-answered__bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${share})` }} />
        </span>
        <p aria-live="polite">{t("hostGame.answered", { answered, total })}</p>
      </div>
    </div>
  );
}

function RevealStage({
  state,
  meta,
  question,
  reveal,
}: {
  state: GameState;
  meta: GameMeta | null | undefined;
  question: PublicQuestion | null;
  reveal: RevealData | null;
}) {
  if (!question || !reveal) return <Loading />;
  const max = Math.max(1, ...reveal.counts);
  return (
    <div className="stage-reveal">
      <QuestionHeader state={state} meta={meta} />
      <h1 className="stage-question__text">{question.text}</h1>
      <ul className="dist">
        {question.options.map((opt, i) => {
          const count = reveal.counts[i] ?? 0;
          return (
            <li
              key={i}
              className="dist__row"
              data-choice={i}
              data-correct={i === reveal.correct ? "true" : "false"}
              style={{ "--i": i } as CSSProperties}
            >
              <div className="dist__bar-wrap">
                <span className="dist__count">{count}</span>
                <span className="dist__bar" style={{ height: `${(count / max) * 100}%` }} />
              </div>
              <div className="dist__label">
                <ChoiceShape index={i} />
                <span className="dist__text">{opt}</span>
                {i === reveal.correct && (
                  <svg className="dist__check" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
