import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import type { GameMeta, GameState, HostActionMap, PublicQuestion, RevealData } from "../../shared/types";
import {
  useAnswerUids,
  useGameState,
  useLeaderboard,
  useMeta,
  usePlayers,
  useQuestion,
  useReveal,
  useServerNow,
} from "../game/hooks";
import { useConnectionLost } from "../game/connection";
import { HostGate } from "../host/HostGate";
import type { MetaWithCapacity } from "../game/actions";
import { displayPlayers, type DisplayPlayer } from "../host/displayNames";
import { allPlayersAnswered, answeredCount, revealDue, useAutoReveal } from "../host/useAutoReveal";
import { useWakeLock } from "../host/useWakeLock";
import { withRetry } from "../host/retry";
import { friendlyError } from "../errors";
import { Layout } from "../components/Layout";
import { Logo } from "../components/Logo";
import { ChoiceShape } from "../components/ChoiceShape";
import { Countdown, remainingSeconds } from "../components/Countdown";
import { Loading } from "../components/Loading";
import { Leaderboard } from "../components/Leaderboard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Podium } from "../components/Podium";
import { club } from "../club.config";
import { hostCall } from "../firebase";
import { t } from "../i18n";

export function HostGame() {
  const { pin = "" } = useParams();
  return <HostGate>{() => <BigScreen pin={pin} />}</HostGate>;
}

type PinAction = Exclude<keyof HostActionMap, "createGame">;

/** A transition lock older than this is stale (crashed call) and ignored, as in the rules. */
const LOCK_STALE_MS = 30_000;

function BigScreen({ pin }: { pin: string }) {
  const meta = useMeta(pin);
  const state = useGameState(pin);
  const question = useQuestion(pin);
  const reveal = useReveal(pin);
  const leaderboard = useLeaderboard(pin);
  const players = usePlayers(pin);
  // display-only (masked / duplicate-marked) labels; actions always use the uid
  const shown = displayPlayers(players);
  const qIndex = state?.qIndex ?? -1;
  const answerUids = useAnswerUids(pin, qIndex);
  const now = useServerNow();
  const lost = useConnectionLost();
  const awake = useWakeLock(state?.phase !== "ended");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showError = useCallback((err: unknown) => setError(friendlyError(err)), []);

  /** Host actions are idempotent (qIndex-guarded): one retry covers lock contention. */
  const run = useCallback(
    async <A extends PinAction>(action: A, args: HostActionMap[A]["req"]) => {
      setBusy(true);
      setError(null);
      try {
        await withRetry(() => hostCall(action, args), { retries: 1, delayMs: 500 });
      } catch (err) {
        showError(err);
      } finally {
        setBusy(false);
      }
    },
    [showError],
  );

  // In-app confirmation: window.confirm would freeze timers and listeners while open, then let
  // the kick and a pending auto-reveal fire in the same tick.
  const [kickTarget, setKickTarget] = useState<{ one: DisplayPlayer } | { many: string[] } | null>(null);
  const kick = useCallback((p: DisplayPlayer) => setKickTarget({ one: p }), []);
  const kickMany = useCallback((uids: string[]) => uids.length > 0 && setKickTarget({ many: uids }), []);
  const confirmKick = () => {
    const target = kickTarget;
    setKickTarget(null);
    if (!target) return;
    if ("one" in target) void run("kickPlayer", { pin, uid: target.one.uid });
    else void run("kickPlayers", { pin, uids: target.many });
  };

  const inQuestion = state?.phase === "question";
  const started = !!state && now >= state.startedAt;
  const playerUids = players.map((p) => p.uid);
  const answered = answeredCount(playerUids, answerUids);
  const allAnswered = allPlayersAnswered(playerUids, answerUids);
  const doReveal = useCallback(() => hostCall("reveal", { pin, qIndex }), [pin, qIndex]);
  const auto = useAutoReveal({
    qIndex,
    active: inQuestion,
    due: inQuestion && started && !!state && revealDue({ endsAt: state.endsAt, now, allAnswered }),
    // never in the same tick as a kick/lock/etc.: wait for it to finish, then re-evaluate
    paused: busy,
    reveal: doReveal,
    onError: showError,
  });
  const computing = !!state?.lock && state.lock.at > now - LOCK_STALE_MS;

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
        body = <LobbyStage pin={pin} meta={meta} players={shown} onKick={kick} busy={busy} />;
        controls = (
          <>
            <button
              type="button"
              className="btn btn--ghost btn--stage"
              aria-pressed={!!meta?.locked}
              disabled={busy || !meta}
              onClick={() => void run("setLobbyLocked", { pin, locked: !meta?.locked })}
            >
              {meta?.locked ? t("hostGame.unlockLobby") : t("hostGame.lockLobby")}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--stage"
              disabled={busy || players.length === 0}
              onClick={() => void run("startGame", { pin })}
            >
              {t("hostGame.start")}
            </button>
          </>
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
          <button
            type="button"
            className="btn btn--primary btn--stage"
            disabled={auto.sent || !started}
            onClick={auto.reveal}
          >
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
            onClick={() => void run("showLeaderboard", { pin, qIndex: state.qIndex })}
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
                onClick={() => void run("nextQuestion", { pin, qIndex: state.qIndex })}
              >
                {t("hostGame.next")}
              </button>
            )}
            <button
              type="button"
              className={`btn btn--stage ${isLast ? "btn--primary" : "btn--ghost"}`}
              disabled={busy}
              onClick={() => void run("endGame", { pin })}
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
  const moderating = !!state && state.phase !== "ended";
  return (
    <Layout
      variant="stage"
      showLogo={!ended}
      offline={lost}
      aside={
        !ended && state ? (
          <>
            {awake && (
              <span className="chip chip--stage chip--awake" title={t("hostGame.wakeLock")}>
                <span className="sr-only">{t("hostGame.wakeLock")}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              </span>
            )}
            <span className="chip chip--stage">{t("join.pinChip", { pin })}</span>
          </>
        ) : undefined
      }
    >
      <div className="stage">
        {computing && (
          <p className="stage__computing" role="status">
            {t("common.computing")}
          </p>
        )}
        <div className="stage__body">{body}</div>
        {error && (
          <p className="stage__error" role="alert">
            {error}
          </p>
        )}
        {(controls || moderating) && (
          <div className="stage__controls">
            {moderating && <PlayersPanel players={shown} onKick={kick} onKickMany={kickMany} busy={busy} />}
            {controls}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={!!kickTarget}
        message={
          !kickTarget
            ? ""
            : "one" in kickTarget
              ? t("hostGame.kickConfirm", { name: kickTarget.one.label })
              : t("hostGame.kickManyConfirm", { count: kickTarget.many.length })
        }
        confirmLabel={t("hostGame.kickConfirmOk")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmKick}
        onCancel={() => setKickTarget(null)}
      />
    </Layout>
  );
}

function LobbyStage({
  pin,
  meta,
  players,
  onKick,
  busy,
}: {
  pin: string;
  meta: GameMeta | null | undefined;
  players: DisplayPlayer[];
  onKick: (p: DisplayPlayer) => void;
  busy: boolean;
}) {
  const full = (meta as MetaWithCapacity | null | undefined)?.full === true;
  return (
    <div className="stage-lobby">
      <div className="stage-lobby__join">
        {meta && <p className="stage-lobby__title">{meta.title}</p>}
        <p className="stage-lobby__url">{t("hostGame.joinAt", { url: window.location.host })}</p>
        <div className="stage-lobby__ticket" data-locked={meta?.locked || undefined}>
          <p className="stage-lobby__pin-label">{t("hostGame.pin")}</p>
          <p className="stage-lobby__pin">{pin}</p>
        </div>
        {meta?.locked && (
          <p className="stage-lobby__locked" role="status">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            {t("hostGame.lobbyLocked")}
          </p>
        )}
      </div>
      <div className="stage-lobby__players">
        <p className="stage-lobby__count" aria-live="polite">
          {t("hostGame.playersOfMax", { count: players.length, max: club.game.maxPlayers })}
          {full && <span className="stage-lobby__full">{t("hostGame.lobbyFull")}</span>}
        </p>
        {players.length === 0 ? (
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
            {players.map((p, i) => (
              <li
                key={p.uid}
                data-choice={i % club.choices.length}
                data-masked={p.masked || undefined}
                data-duplicate={p.duplicate || undefined}
              >
                <ChoiceShape index={i % club.choices.length} />
                <PlayerLabel player={p} />
                <KickButton player={p} onKick={onKick} disabled={busy} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Masked/duplicate-aware name; never renders the raw name of a masked player. */
function PlayerLabel({ player }: { player: DisplayPlayer }) {
  return (
    <span className="player-label">
      <span>{player.label}</span>
      {player.duplicate && (
        <span className="dup-badge" title={t("hostGame.duplicateName")}>
          {t("hostGame.duplicateName")}
        </span>
      )}
    </span>
  );
}

function KickButton({
  player,
  onKick,
  disabled,
}: {
  player: DisplayPlayer;
  onKick: (p: DisplayPlayer) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      className="kick-btn"
      aria-label={t("hostGame.kick", { name: player.label })}
      title={t("hostGame.kick", { name: player.label })}
      disabled={disabled}
      onClick={() => onKick(player)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 7l10 10M17 7L7 17" />
      </svg>
    </button>
  );
}

/**
 * Host moderation panel (lobby and mid-game): kick one player, or select several and remove them
 * in one kickPlayers call. The list renders only while open (it can hold hundreds of names).
 */
function PlayersPanel({
  players,
  onKick,
  onKickMany,
  busy,
}: {
  players: DisplayPlayer[];
  onKick: (p: DisplayPlayer) => void;
  onKickMany: (uids: string[]) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  // players who left / were kicked drop out of the selection automatically
  const selected = players.filter((p) => picked.has(p.uid)).map((p) => p.uid);
  const toggle = (uid: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  return (
    <details className="stage-panel" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{t("hostGame.playersPanel", { count: players.length })}</summary>
      {open && (
        <div className="stage-panel__pop">
          <ul className="stage-panel__list">
            {players.map((p) => (
              <li key={p.uid} data-masked={p.masked || undefined} data-duplicate={p.duplicate || undefined}>
                <label className="stage-panel__pick">
                  <input
                    type="checkbox"
                    checked={picked.has(p.uid)}
                    onChange={() => toggle(p.uid)}
                    aria-label={t("hostGame.select", { name: p.label })}
                  />
                  <PlayerLabel player={p} />
                </label>
                <KickButton player={p} onKick={onKick} disabled={busy} />
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn--danger btn--small stage-panel__bulk"
            disabled={busy || selected.length === 0}
            onClick={() => {
              onKickMany(selected);
              setPicked(new Set());
            }}
          >
            {t("hostGame.kickSelected", { count: selected.length })}
          </button>
        </div>
      )}
    </details>
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
  const leadIn = now < state.startedAt;
  return (
    <div className="stage-question">
      <div className="stage-question__head">
        <div>
          <QuestionHeader state={state} meta={meta} />
          <h1 className="stage-question__text">{question.text}</h1>
        </div>
        {leadIn ? (
          <div className="stage-getready" role="status">
            <p className="stage-getready__title">{t("hostGame.getReady")}</p>
            <p className="stage-getready__num">{remainingSeconds(state.startedAt, now)}</p>
          </div>
        ) : (
          <Countdown endsAt={state.endsAt} totalSeconds={question.seconds} serverNow={now} size="lg" />
        )}
      </div>
      {question.imageUrl && <img className="stage-question__img" src={question.imageUrl} alt="" />}
      <ul className="stage-options" data-count={question.options.length} data-leadin={leadIn || undefined}>
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
