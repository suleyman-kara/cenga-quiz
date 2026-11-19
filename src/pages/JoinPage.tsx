import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { isValidPin } from "../../shared/pin";
import { NAME_MAX, isValidName, normalizeName } from "../../shared/names";
import { checkGame, joinGame } from "../game/actions";
import { loadSession, saveSession } from "../game/session";
import { Layout } from "../components/Layout";
import { ChoiceShape } from "../components/ChoiceShape";
import { club } from "../club.config";
import { t } from "../i18n";

const digitsOnly = (s: string) => s.replace(/\D/g, "").slice(0, 6);

export function JoinPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const existing = loadSession();
  const [step, setStep] = useState<"pin" | "name">("pin");
  const [pin, setPin] = useState(() => digitsOnly(params.get("pin") ?? ""));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (existing) return <Navigate to={`/play/${existing.pin}`} replace />;

  const pinOk = isValidPin(pin);
  const pinWrong = pin.length === 6 && !pinOk;

  async function submitPin(e: FormEvent) {
    e.preventDefault();
    if (!pinOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await checkGame(pin);
      if (res === "ok") setStep("name");
      else setError(t(res === "started" ? "join.started" : "join.notFound"));
    } catch (err) {
      setError(t("common.error", { message: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  async function submitName(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const clean = normalizeName(name);
    if (!isValidName(clean)) {
      setError(t("join.nameInvalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await joinGame(pin, clean);
      saveSession({ pin, name: clean });
      navigate(`/play/${pin}`, { replace: true });
    } catch (err) {
      setError(t("common.error", { message: (err as Error).message }));
      setBusy(false);
    }
  }

  return (
    <Layout>
      <section className="join" data-step={step}>
        <div className="join__hero">
          <span className="shape-row" aria-hidden="true">
            {club.choices.map((c, i) => (
              <span key={c.id} className="shape-row__item" data-choice={i}>
                <ChoiceShape index={i} />
              </span>
            ))}
          </span>
          <h1 className="join__tagline">{club.tagline[club.locale]}</h1>
        </div>
        {step === "pin" ? (
          <form className="card join__card" onSubmit={submitPin} noValidate>
            <label className="field__label" htmlFor="pin">
              {t("join.pinLabel")}
            </label>
            <div className="pin-field" data-invalid={pinWrong || undefined}>
              <input
                id="pin"
                className="pin-field__input"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                enterKeyHint="go"
                maxLength={6}
                value={pin}
                aria-describedby="pin-hint"
                aria-invalid={pinWrong || undefined}
                onChange={(e) => {
                  setPin(digitsOnly(e.target.value));
                  setError(null);
                }}
                autoFocus
              />
              <span className="pin-field__cells" aria-hidden="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <span
                    key={i}
                    className="pin-field__cell"
                    data-filled={i < pin.length || undefined}
                    data-active={i === Math.min(pin.length, 5) || undefined}
                  >
                    {pin[i] ?? ""}
                  </span>
                ))}
              </span>
            </div>
            <p id="pin-hint" className="field__hint">
              {pinWrong ? <span className="field__error">{t("join.pinInvalid")}</span> : t("join.pinHint")}
            </p>
            {error && (
              <p className="field__error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="btn btn--primary btn--block"
              disabled={!pinOk || busy}
              aria-busy={busy || undefined}
            >
              {busy ? t("join.checking") : t("join.continue")}
            </button>
          </form>
        ) : (
          <form className="card join__card" onSubmit={submitName} noValidate>
            <p className="chip join__pin-chip">{t("join.pinChip", { pin })}</p>
            <label className="field__label" htmlFor="nickname">
              {t("join.nameLabel")}
            </label>
            <input
              id="nickname"
              className="text-input"
              maxLength={NAME_MAX}
              autoComplete="nickname"
              autoCapitalize="words"
              enterKeyHint="go"
              value={name}
              aria-describedby="name-hint"
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              autoFocus
            />
            <p id="name-hint" className="field__hint">
              {t("join.nameHint", { max: NAME_MAX })}
            </p>
            {error && (
              <p className="field__error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn--primary btn--block" disabled={busy} aria-busy={busy || undefined}>
              {busy ? t("join.joining") : t("join.join")}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => {
                setStep("pin");
                setError(null);
              }}
            >
              {t("join.changePin")}
            </button>
          </form>
        )}
      </section>
    </Layout>
  );
}
