import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QUIZ_LIMITS, validateQuiz } from "../../shared/quizValidate";
import { loadQuiz, saveQuiz, updateQuiz, type HostUser } from "../game/host";
import { HostGate } from "../host/HostGate";
import {
  addOption,
  addQuestion,
  describeErrors,
  draftFromQuiz,
  draftToInput,
  emptyDraft,
  moveQuestion,
  removeOption,
  removeQuestion,
  setCorrect,
  setOption,
  updateQuestion,
  type QuizDraft,
} from "../host/quizDraft";
import { Layout } from "../components/Layout";
import { Loading } from "../components/Loading";
import { ChoiceShape } from "../components/ChoiceShape";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { club } from "../club.config";
import { t } from "../i18n";

/** /host/quiz/yeni creates a quiz; /host/quiz/:id edits one of the host's own quizzes. */
export function QuizEditor() {
  const { id = "yeni" } = useParams();
  return <HostGate>{(user) => <Editor key={id} id={id} user={user} />}</HostGate>;
}

const NEW_ID = "yeni";

function Editor({ id, user }: { id: string; user: HostUser }) {
  const navigate = useNavigate();
  const isNew = id === NEW_ID;
  const [draft, setDraft] = useState<QuizDraft | null | undefined>(isNew ? emptyDraft() : undefined);
  const [dirty, setDirty] = useState(false);
  // After the first failed save, problems are recomputed from the current draft on every edit.
  const [showErrors, setShowErrors] = useState(false);
  const errors = useMemo(() => {
    if (!showErrors || !draft) return null;
    const r = validateQuiz(draftToInput(draft));
    return r.ok ? null : describeErrors(r.errors);
  }, [showErrors, draft]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    loadQuiz(id).then(
      (q) => !cancelled && setDraft(q ? draftFromQuiz(q) : null),
      (err: Error) => !cancelled && (setDraft(null), setSaveError(t("common.error", { message: err.message }))),
    );
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  // Browser close / reload with unsaved changes: let the browser ask.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (f: (d: QuizDraft) => QuizDraft) => {
    setDraft((d) => (d ? f(d) : d));
    setDirty(true);
  };

  async function save() {
    if (!draft) return;
    setSaveError(null);
    const result = validateQuiz(draftToInput(draft));
    if (!result.ok) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    try {
      if (isNew) await saveQuiz(user.uid, result.quiz);
      else await updateQuiz(id, result.quiz);
      setDirty(false);
      navigate("/host");
    } catch (err) {
      setSaveError(t("common.error", { message: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  const back = () => (dirty ? setLeaving(true) : navigate("/host"));

  let body;
  if (draft === undefined) body = <Loading variant="text" />;
  else if (draft === null)
    body = (
      <div className="stack center">
        <p className="lead">{saveError ?? t("editor.notFound")}</p>
      </div>
    );
  else {
    const hasErrors = !!errors && (errors.general.length > 0 || Object.keys(errors.byQuestion).length > 0);
    body = (
      <form
        className="editor stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <section className="card stack">
          <label className="field__label" htmlFor="quiz-title">
            {t("editor.title")}
          </label>
          <input
            id="quiz-title"
            className="text-input"
            maxLength={QUIZ_LIMITS.titleMax}
            value={draft.title}
            onChange={(e) => edit((d) => ({ ...d, title: e.target.value }))}
          />
          <label className="field__label" htmlFor="quiz-description">
            {t("editor.description")}
          </label>
          <textarea
            id="quiz-description"
            className="text-input"
            rows={2}
            maxLength={QUIZ_LIMITS.descriptionMax}
            value={draft.description}
            onChange={(e) => edit((d) => ({ ...d, description: e.target.value }))}
          />
        </section>

        <ol className="editor__questions">
          {draft.questions.map((q, qi) => {
            const n = qi + 1;
            const legendId = `q-${qi}-legend`;
            const qErrors = errors?.byQuestion[qi];
            return (
              <li key={qi} className="card editor-q" role="group" aria-labelledby={legendId}>
                <div className="editor-q__head">
                  <h2 id={legendId} className="subhead">
                    {t("editor.question", { n })}
                  </h2>
                  <div className="editor-q__tools">
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      aria-label={t("editor.moveUp", { n })}
                      title={t("editor.moveUp", { n })}
                      disabled={qi === 0}
                      onClick={() => edit((d) => moveQuestion(d, qi, -1))}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      aria-label={t("editor.moveDown", { n })}
                      title={t("editor.moveDown", { n })}
                      disabled={qi === draft.questions.length - 1}
                      onClick={() => edit((d) => moveQuestion(d, qi, 1))}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small btn--danger"
                      aria-label={t("editor.removeQuestion", { n })}
                      title={t("editor.removeQuestion", { n })}
                      disabled={draft.questions.length <= 1}
                      onClick={() => edit((d) => removeQuestion(d, qi))}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <label className="field__label" htmlFor={`q-${qi}-text`}>
                  {t("editor.text")}
                </label>
                <textarea
                  id={`q-${qi}-text`}
                  className="text-input"
                  rows={2}
                  maxLength={QUIZ_LIMITS.textMax}
                  value={q.text}
                  onChange={(e) => edit((d) => updateQuestion(d, qi, { text: e.target.value }))}
                />

                <fieldset className="editor-q__options">
                  <legend className="field__label">{t("editor.correctLegend")}</legend>
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="editor-opt" data-choice={oi} data-correct={q.correct === oi || undefined}>
                      <input
                        type="radio"
                        name={`q-${qi}-correct`}
                        aria-label={t("editor.correct", { n: oi + 1 })}
                        checked={q.correct === oi}
                        onChange={() => edit((d) => setCorrect(d, qi, oi))}
                      />
                      <span className="editor-opt__shape" aria-hidden="true">
                        <ChoiceShape index={oi} />
                      </span>
                      <input
                        className="text-input"
                        aria-label={t("editor.option", { n: oi + 1 })}
                        maxLength={QUIZ_LIMITS.optionMax}
                        value={opt}
                        onChange={(e) => edit((d) => setOption(d, qi, oi, e.target.value))}
                      />
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        aria-label={t("editor.removeOption", { n: oi + 1 })}
                        title={t("editor.removeOption", { n: oi + 1 })}
                        disabled={q.options.length <= QUIZ_LIMITS.optionsMin}
                        onClick={() => edit((d) => removeOption(d, qi, oi))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn--ghost btn--small editor-q__add-opt"
                    disabled={q.options.length >= QUIZ_LIMITS.optionsMax}
                    onClick={() => edit((d) => addOption(d, qi))}
                  >
                    {t("editor.addOption")}
                  </button>
                </fieldset>

                <div className="editor-q__extra">
                  <div className="stack editor-q__seconds">
                    <label className="field__label" htmlFor={`q-${qi}-seconds`}>
                      {t("editor.seconds")}
                    </label>
                    <input
                      id={`q-${qi}-seconds`}
                      className="text-input"
                      inputMode="numeric"
                      placeholder={t("editor.secondsHint", { default: club.game.defaultQuestionSeconds })}
                      value={q.seconds}
                      onChange={(e) => edit((d) => updateQuestion(d, qi, { seconds: e.target.value }))}
                    />
                  </div>
                  <div className="stack editor-q__image">
                    <label className="field__label" htmlFor={`q-${qi}-image`}>
                      {t("editor.image")}
                    </label>
                    <input
                      id={`q-${qi}-image`}
                      className="text-input"
                      type="url"
                      placeholder="https://"
                      value={q.imageUrl}
                      onChange={(e) => edit((d) => updateQuestion(d, qi, { imageUrl: e.target.value }))}
                    />
                  </div>
                </div>

                {qErrors && (
                  <ul className="field__error editor-q__errors">
                    {qErrors.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>

        <button
          type="button"
          className="btn btn--ghost editor__add-q"
          disabled={draft.questions.length >= QUIZ_LIMITS.questionsMax}
          onClick={() => edit(addQuestion)}
        >
          {t("editor.addQuestion")}
        </button>

        {hasErrors && (
          <div className="field__error" role="alert">
            <p>{t("editor.fix")}</p>
            <ul>
              {errors.general.map((m, i) => (
                <li key={`g${i}`}>{m}</li>
              ))}
              {Object.entries(errors.byQuestion).flatMap(([qi, list]) =>
                list.map((m, i) => (
                  <li key={`${qi}-${i}`}>
                    {t("editor.question", { n: Number(qi) + 1 })} · {m}
                  </li>
                )),
              )}
            </ul>
          </div>
        )}
        {saveError && (
          <p className="field__error" role="alert">
            {saveError}
          </p>
        )}

        <div className="editor__bar">
          <button type="button" className="btn btn--ghost" onClick={back}>
            {t("editor.back")}
          </button>
          <button type="submit" className="btn btn--primary" aria-busy={busy || undefined} disabled={busy}>
            {busy ? t("editor.saving") : t("editor.save")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <Layout>
      <div className="editor-page stack">
        <h1 className="headline">{isNew ? t("editor.newTitle") : t("editor.editTitle")}</h1>
        {body}
      </div>
      <ConfirmDialog
        open={leaving}
        message={t("editor.leaveConfirm")}
        confirmLabel={t("editor.leaveOk")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          setLeaving(false);
          setDirty(false);
          navigate("/host");
        }}
        onCancel={() => setLeaving(false)}
      />
    </Layout>
  );
}
