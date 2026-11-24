import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QUIZ_LIMITS, validateQuiz } from "../../shared/quizValidate";
import { loadQuiz, saveQuiz, updateQuiz, type HostUser } from "../game/host";
import { HostGate } from "../host/HostGate";
import {
  addOption,
  addQuestion,
  appendQuestions,
  describeErrors,
  draftFromQuiz,
  draftToInput,
  duplicateQuestion,
  emptyDraft,
  isEmptyQuestion,
  isPreviewableImage,
  moveQuestion,
  removeOption,
  removeQuestion,
  reorderQuestion,
  setCorrect,
  setOption,
  updateQuestion,
  type QuestionDraft,
  type QuizDraft,
} from "../host/quizDraft";
import { parseQuestionsText } from "../host/quizText";
import { downloadQuiz } from "../host/quizFile";
import { IMAGE_LIMITS, checkImageFile, uploadQuizImage } from "../host/imageUpload";
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

/** Stable key for a question card (ids come from quizDraft; the index is only a fallback). */
const cardKey = (q: QuestionDraft, qi: number) => q.id ?? -(qi + 1);

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
  /** keys of collapsed question cards */
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const dragFrom = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  // per question: an image upload in progress, or its error
  const [imageUpload, setImageUpload] = useState<Record<number, { busy?: true; error?: string }>>({});

  async function pickImage(qi: number, file: File | undefined) {
    if (!file) return;
    const problem = checkImageFile(file);
    if (problem) {
      setImageUpload((s) => ({ ...s, [qi]: { error: t(problem === "type" ? "editor.imageBadType" : "editor.imageTooBig") } }));
      return;
    }
    setImageUpload((s) => ({ ...s, [qi]: { busy: true } }));
    try {
      const url = await uploadQuizImage(user.uid, file);
      edit((d) => updateQuestion(d, qi, { imageUrl: url }));
      setImageUpload((s) => ({ ...s, [qi]: {} }));
    } catch {
      setImageUpload((s) => ({ ...s, [qi]: { error: t("editor.imageUploadFailed") } }));
    }
  }

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

  /** Validated quiz, or null after switching the error display on. */
  function validated() {
    if (!draft) return null;
    const result = validateQuiz(draftToInput(draft));
    if (!result.ok) {
      setShowErrors(true);
      return null;
    }
    return result.quiz;
  }

  async function save() {
    setSaveError(null);
    const quiz = validated();
    if (!quiz) return;
    setBusy(true);
    try {
      if (isNew) await saveQuiz(user.uid, quiz);
      else await updateQuiz(id, quiz);
      setDirty(false);
      navigate("/host");
    } catch (err) {
      setSaveError(t("common.error", { message: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const quiz = validated();
    if (quiz) downloadQuiz(quiz);
  }

  const back = () => (dirty ? setLeaving(true) : navigate("/host"));

  const toggleCard = (key: number) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Drag and drop (mouse); the ↑/↓ buttons remain the keyboard way.
  const endDrag = () => {
    dragFrom.current = null;
    setDropTarget(null);
  };
  const onDragStart = (e: DragEvent<HTMLElement>, qi: number) => {
    dragFrom.current = qi;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(qi + 1));
    const card = e.currentTarget.closest("li");
    if (card) e.dataTransfer.setDragImage(card, 24, 24);
  };
  const onDragOver = (e: DragEvent<HTMLElement>, qi: number) => {
    if (dragFrom.current === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== qi) setDropTarget(qi);
  };
  const onDrop = (e: DragEvent<HTMLElement>, qi: number) => {
    const from = dragFrom.current;
    if (from === null) return;
    e.preventDefault();
    if (from !== qi) edit((d) => reorderQuestion(d, from, qi));
    endDrag();
  };

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
    const keys = draft.questions.map(cardKey);
    const allCollapsed = keys.every((k) => collapsed.has(k));
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

        <PastePanel
          draft={draft}
          onOpen={() => setNotice(null)}
          onAdd={(questions, added) => {
            edit((d) => appendQuestions(d, questions));
            setNotice(t("editor.pasteAdded", { count: added }));
          }}
        />
        {notice && (
          <p className="status status--ok" role="status">
            {notice}
          </p>
        )}

        <div className="editor__list-bar">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(keys))}
          >
            {allCollapsed ? t("editor.expandAll") : t("editor.collapseAll")}
          </button>
        </div>

        <ol className="editor__questions">
          {draft.questions.map((q, qi) => {
            const n = qi + 1;
            const key = keys[qi];
            const legendId = `q-${qi}-legend`;
            const bodyId = `q-${qi}-body`;
            const qErrors = errors?.byQuestion[qi];
            // Cards with validation problems are always shown open.
            const open = !collapsed.has(key) || !!qErrors;
            const summaryText = q.text.trim()
              ? q.text.trim().length > 80
                ? `${q.text.trim().slice(0, 79)}…`
                : q.text.trim()
              : t("editor.summaryEmpty");
            return (
              <li
                key={key}
                className="card editor-q"
                role="group"
                aria-labelledby={legendId}
                data-collapsed={!open || undefined}
                data-drop-target={(dropTarget === qi && dragFrom.current !== qi) || undefined}
                onDragOver={(e) => onDragOver(e, qi)}
                onDrop={(e) => onDrop(e, qi)}
              >
                <div className="editor-q__head">
                  <span
                    className="editor-q__handle"
                    data-drag-handle
                    draggable
                    title={t("editor.dragHandle")}
                    aria-hidden="true"
                    onDragStart={(e) => onDragStart(e, qi)}
                    onDragEnd={endDrag}
                  >
                    ⠿
                  </span>
                  <h2 id={legendId} className="subhead">
                    {t("editor.question", { n })}
                  </h2>
                  <div className="editor-q__tools">
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      aria-label={open ? t("editor.collapse", { n }) : t("editor.expand", { n })}
                      title={open ? t("editor.collapse", { n }) : t("editor.expand", { n })}
                      aria-expanded={open}
                      aria-controls={open ? bodyId : undefined}
                      disabled={!!qErrors}
                      onClick={() => toggleCard(key)}
                    >
                      {open ? "▾" : "▸"}
                    </button>
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
                      className="btn btn--ghost btn--small"
                      aria-label={t("editor.duplicate", { n })}
                      title={t("editor.duplicate", { n })}
                      disabled={draft.questions.length >= QUIZ_LIMITS.questionsMax}
                      onClick={() => edit((d) => duplicateQuestion(d, qi))}
                    >
                      ⧉
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

                {!open && (
                  <p className="editor-q__summary">
                    {t("editor.summary", {
                      n,
                      text: summaryText,
                      count: q.options.length,
                      letter: String.fromCharCode(65 + q.correct),
                    })}
                  </p>
                )}

                {open && (
                  <div id={bodyId} className="editor-q__body">
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
                        <label className="btn btn--ghost btn--small editor-q__upload" aria-busy={imageUpload[qi]?.busy}>
                          {imageUpload[qi]?.busy ? t("editor.imageUploading") : t("editor.imageUpload")}
                          <input
                            type="file"
                            className="sr-only"
                            accept={IMAGE_LIMITS.types.join(",")}
                            disabled={!!imageUpload[qi]?.busy}
                            onChange={(e) => {
                              void pickImage(qi, e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {imageUpload[qi]?.error && (
                          <p className="field__error" role="alert">
                            {imageUpload[qi]?.error}
                          </p>
                        )}
                        {isPreviewableImage(q.imageUrl) && (
                          <ImageThumb
                            key={q.imageUrl.trim()}
                            url={q.imageUrl.trim()}
                            alt={t("editor.imagePreview", { n })}
                          />
                        )}
                      </div>
                    </div>

                    {qErrors && (
                      <ul className="field__error editor-q__errors">
                        {qErrors.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    )}
                  </div>
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
          <div className="editor__bar-end">
            <button type="button" className="btn btn--ghost" onClick={download}>
              {t("editor.download")}
            </button>
            <button type="submit" className="btn btn--primary" aria-busy={busy || undefined} disabled={busy}>
              {busy ? t("editor.saving") : t("editor.save")}
            </button>
          </div>
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

/** Small preview of a question image; disappears if the address does not load. */
function ImageThumb({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      className="editor-q__thumb"
      src={url}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

/** "Metinden soru ekle": paste questions as text, preview what was understood, then append. */
function PastePanel({
  draft,
  onOpen,
  onAdd,
}: {
  draft: QuizDraft;
  onOpen: () => void;
  onAdd: (questions: QuestionDraft[], added: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseQuestionsText(text), [text]);
  const found = parsed.questions.length;
  // A fresh quiz's single empty question is replaced, so it does not take up room.
  const used = draft.questions.length === 1 && isEmptyQuestion(draft.questions[0]) ? 0 : draft.questions.length;
  const room = Math.max(0, QUIZ_LIMITS.questionsMax - used);
  const willAdd = Math.min(found, room);

  return (
    <section className="card stack editor-paste">
      <h2 className="subhead editor-paste__title">
        <button
          type="button"
          className="btn btn--ghost btn--small editor-paste__toggle"
          aria-expanded={open}
          aria-controls={open ? "editor-paste-body" : undefined}
          onClick={() => {
            if (!open) onOpen();
            setOpen(!open);
          }}
        >
          {t("editor.pasteTitle")}
        </button>
      </h2>
      {open && (
        <div id="editor-paste-body" className="stack">
          <label className="field__label" htmlFor="editor-paste-text">
            {t("editor.pasteLabel")}
          </label>
          <p id="editor-paste-hint" className="field__hint">
            {t("editor.pasteHint")}
          </p>
          <textarea
            id="editor-paste-text"
            className="text-input editor-paste__text"
            rows={10}
            spellCheck={false}
            aria-describedby="editor-paste-hint"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="editor-paste__preview" role="status" aria-live="polite">
            {text.trim() && <p>{found > 0 ? t("editor.pasteFound", { count: found }) : t("editor.pasteNone")}</p>}
            {found > room && <p>{t("editor.pasteTooMany", { max: QUIZ_LIMITS.questionsMax, count: willAdd })}</p>}
          </div>
          {parsed.warnings.length > 0 && (
            <ul className="editor-paste__warnings">
              {parsed.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn btn--primary editor-paste__add"
            disabled={willAdd === 0}
            onClick={() => {
              onAdd(parsed.questions, willAdd);
              setText("");
              setOpen(false);
            }}
          >
            {t("editor.pasteAdd")}
          </button>
        </div>
      )}
    </section>
  );
}
