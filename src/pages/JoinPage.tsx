import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { isValidPin } from "../../shared/pin";
import { NAME_MAX, isValidName, normalizeName } from "../../shared/names";
import { checkGame, joinGame } from "../game/actions";
import { loadSession, saveSession } from "../game/session";
import { Layout } from "../components/Layout";
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
      <section className="join">
        <p className="join__tagline">{club.tagline[club.locale]}</p>
        {step === "pin" ? (
          <form className="card join__card" onSubmit={submitPin} noValidate>
            <label className="field__label" htmlFor="pin">
              {t("join.pinLabel")}
            </label>
            <input
              id="pin"
              className="pin-input"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              enterKeyHint="go"
              maxLength={6}
              placeholder="••••••"
              value={pin}
              aria-describedby="pin-hint"
              aria-invalid={pinWrong || undefined}
              onChange={(e) => {
                setPin(digitsOnly(e.target.value));
                setError(null);
              }}
              autoFocus
            />
            <p id="pin-hint" className="field__hint">
              {pinWrong ? <span className="field__error">{t("join.pinInvalid")}</span> : t("join.pinHint")}
            </p>
            {error && (
              <p className="field__error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn--primary btn--block" disabled={!pinOk || busy}>
              {busy ? t("join.checking") : t("join.continue")}
            </button>
          </form>
        ) : (
          <form className="card join__card" onSubmit={submitName} noValidate>
            <p className="chip">{t("join.pinChip", { pin })}</p>
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
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
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
