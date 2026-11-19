import { useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { validateQuiz } from "../../shared/quizValidate";
import { saveQuiz, useMyQuizzes, type HostUser } from "../game/host";
import { HostGate } from "../host/HostGate";
import { Layout } from "../components/Layout";
import { ChoiceShape } from "../components/ChoiceShape";
import { Loading } from "../components/Loading";
import { club } from "../club.config";
import { call } from "../firebase";
import { t } from "../i18n";

export function HostPage() {
  return <HostGate>{(user, signOut) => <Dashboard user={user} signOut={signOut} />}</HostGate>;
}

function Dashboard({ user, signOut }: { user: HostUser; signOut: () => Promise<void> }) {
  const navigate = useNavigate();
  const { quizzes, loading, error } = useMyQuizzes(user.uid);
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  async function start(quizId: string) {
    if (starting) return;
    setStarting(quizId);
    setStartError(null);
    try {
      const { pin } = await call("createGame", { quizId });
      navigate(`/host/game/${pin}`);
    } catch (err) {
      setStartError(t("common.error", { message: (err as Error).message }));
      setStarting(null);
    }
  }

  return (
    <Layout
      aside={
        <button type="button" className="btn btn--ghost btn--small" onClick={() => void signOut()}>
          {t("host.signOut")}
        </button>
      }
    >
      <div className="dashboard">
        <section className="stack">
          <div className="dashboard__head">
            <h1 className="headline">{t("host.myQuizzes")}</h1>
            <p className="muted">{t("host.signedInAs", { email: user.email ?? "" })}</p>
          </div>
          {startError && (
            <p className="field__error" role="alert">
              {startError}
            </p>
          )}
          {error && (
            <p className="field__error" role="alert">
              {t("common.error", { message: error })}
            </p>
          )}
          {loading ? (
            <Loading variant="text" />
          ) : quizzes.length === 0 ? (
            <div className="empty">
              <span className="shape-row" aria-hidden="true">
                {club.choices.map((c, i) => (
                  <span key={c.id} className="shape-row__item" data-choice={i}>
                    <ChoiceShape index={i} />
                  </span>
                ))}
              </span>
              <p className="lead">{t("host.noQuizzes")}</p>
            </div>
          ) : (
            <ul className="quiz-list">
              {quizzes.map((q) => (
                <li key={q.id} className="quiz-card card">
                  <div className="quiz-card__body">
                    <h2 className="quiz-card__title">{q.title}</h2>
                    <p className="quiz-card__meta">
                      <ChoiceShape index={0} />
                      {t("host.questionsCount", { count: q.questionCount })}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn--primary"
                    aria-busy={starting === q.id || undefined}
                    disabled={starting !== null}
                    onClick={() => void start(q.id)}
                  >
                    {starting === q.id ? t("host.creating") : t("host.createGame")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <QuizImport uid={user.uid} />
      </div>
    </Layout>
  );
}

function QuizImport({ uid }: { uid: string }) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<{ message: string; errors?: string[] } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
    setProblem(null);
    setSaved(null);
  }

  async function save() {
    setSaved(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      setProblem({ message: t("host.importInvalidJson", { message: (err as Error).message }) });
      return;
    }
    const result = validateQuiz(parsed);
    if (!result.ok) {
      setProblem({ message: t("host.importErrors"), errors: result.errors });
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      await saveQuiz(uid, result.quiz);
      setSaved(t("host.importSaved", { title: result.quiz.title }));
      setText("");
    } catch (err) {
      setProblem({ message: t("common.error", { message: (err as Error).message }) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack import">
      <h2 className="subhead">{t("host.importTitle")}</h2>
      <div className="dropzone">
        <svg className="dropzone__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
        </svg>
        <label className="field__label" htmlFor="quiz-file">
          {t("host.importFile")}
        </label>
        {fileName && <span className="dropzone__file">{fileName}</span>}
        <input id="quiz-file" type="file" accept="application/json,.json" onChange={(e) => void onFile(e)} />
      </div>
      <label className="field__label" htmlFor="quiz-json">
        {t("host.importPaste")}
      </label>
      <textarea
        id="quiz-json"
        className="text-input import__json"
        rows={8}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setProblem(null);
        }}
      />
      {problem && (
        <div className="field__error" role="alert">
          <p>{problem.message}</p>
          {problem.errors && (
            <ul>
              {problem.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {saved && (
        <p className="status status--ok" role="status">
          {saved}
        </p>
      )}
      <button
        type="button"
        className="btn btn--primary"
        aria-busy={busy || undefined}
        disabled={busy || !text.trim()}
        onClick={() => void save()}
      >
        {t("host.importSave")}
      </button>
    </section>
  );
}
