import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { isValidPin } from "../../shared/pin";
import { NAME_MAX, isValidName, normalizeName } from "../../shared/names";
import { isNameAllowed } from "../../shared/profanity";
import { checkGame, joinGame, type GameCheck } from "../game/actions";
import { useOfflineFor } from "../game/connection";
import { loadLastSession, saveSession } from "../game/session";
import { friendlyError, isPermissionDenied } from "../errors";
import type { MessageKey } from "../i18n";
import { Layout } from "../components/Layout";
import { ChoiceShape } from "../components/ChoiceShape";
import { club } from "../club.config";
import { t } from "../i18n";

const digitsOnly = (s: string) => s.replace(/\D/g, "").slice(0, 6);

const CHECK_MESSAGE: Record<Exclude<GameCheck["kind"], "ok" | "rejoin">, MessageKey> = {
  notFound: "join.notFound",
  started: "join.started",
  banned: "join.banned",
  locked: "join.locked",
  full: "join.full",
};

/** If WebSockets are blocked the realtime connection never comes up; suggest mobile data. */
const SLOW_NETWORK_MS = 8000;

export function JoinPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const existing = loadLastSession();
  const [step, setStep] = useState<"pin" | "name">("pin");
  const [pin, setPin] = useState(() => digitsOnly(params.get("pin") ?? ""));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => (params.get("invalid") ? t("app.invalidPin") : null));
  const slowNetwork = useOfflineFor(SLOW_NETWORK_MS);

  // Arriving with ?pin= (QR code, or sent back from /play after losing the session): check it
  // right away so a returning player is rejoined without typing anything.
  const autoChecked = useRef(false);
  useEffect(() => {
    if (autoChecked.current || !isValidPin(pin) || !params.get("pin")) return;
    autoChecked.current = true;
    void runCheck();
  }, []);

  if (existing && !params.get("pin")) return <Navigate to={`/play/${existing.pin}`} replace />;

  /** Applies a checkGame result; returns true when the name step may continue. */
  function applyCheck(res: GameCheck): boolean {
    if (res.kind === "ok") return true;
    if (res.kind === "rejoin") {
      saveSession({ pin, name: res.name });
      navigate(`/play/${pin}`, { replace: true });
      return false;
    }
    setError(t(CHECK_MESSAGE[res.kind]));
    return false;
  }

  const pinOk = isValidPin(pin);
  const pinWrong = pin.length === 6 && !pinOk;

  async function submitPin(e: FormEvent) {
    e.preventDefault();
    if (!pinOk || busy) return;
    await runCheck();
  }

  async function runCheck() {
    setBusy(true);
    setError(null);
    try {
      if (applyCheck(await checkGame(pin))) setStep("name");
    } catch (err) {
      setError(friendlyError(err));
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
    if (!isNameAllowed(clean)) {
      setError(t("join.nameNotAllowed"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await joinGame(pin, clean);
      saveSession({ pin, name: clean });
      navigate(`/play/${pin}`, { replace: true });
    } catch (err) {
      // Rules refused the write: the lobby got locked, the game started, we were kicked, or we
      // are already in (write-once). Ask the room what happened.
      const message = friendlyError(err);
      if (isPermissionDenied(err)) {
        try {
          const res = await checkGame(pin);
          if (!applyCheck(res)) return;
        } catch {
          /* keep the generic message */
        }
      }
      setError(message);
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
                autoComplete="off"
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
        {slowNetwork && (
          <p className="join__network status" role="status">
            {t("join.slowNetwork")}
          </p>
        )}
        <PrivacyNotice />
      </section>
    </Layout>
  );
}

/** KVKK notice: what is stored, where, for how long. Club name only via config. */
function PrivacyNotice() {
  const days = club.game.resultsRetentionDays;
  return (
    <aside className="privacy" aria-labelledby="privacy-title">
      <h2 id="privacy-title" className="privacy__title">
        {t("join.privacyTitle")}
      </h2>
      <ul>
        <li>{t("join.privacyStored", { club: club.name })}</li>
        <li>{t("join.privacyWhere")}</li>
        <li>{days > 0 ? t("join.privacyRetention", { days }) : t("join.privacyRetentionGeneric")}</li>
        <li>{t("join.privacyNickname")}</li>
      </ul>
    </aside>
  );
}
