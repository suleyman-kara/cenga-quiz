import { useState, type FormEvent, type ReactNode } from "react";
import { useHostAuth, type HostAuth, type HostUser } from "../game/host";
import { Layout } from "../components/Layout";
import { Logo } from "../components/Logo";
import { club } from "../club.config";
import { t } from "../i18n";
import { friendlyError, hostAuthError } from "../errors";

export const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
const isEmail = (v: string) => v.length <= 254 && EMAIL_RE.test(v);

type Mode = "signIn" | "signUp";
type Notice = { kind: "error" | "info"; text: string } | null;

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return notice.kind === "error" ? (
    <p className="field__error" role="alert">
      {notice.text}
    </p>
  ) : (
    <p className="muted" role="status">
      {notice.text}
    </p>
  );
}

function SignInForm({ auth }: { auth: HostAuth }) {
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const switchMode = (m: Mode) => {
    setMode(m);
    setNotice(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const address = email.trim();
    if (!isEmail(address)) return setNotice({ kind: "error", text: t("host.invalidEmail") });
    if (mode === "signUp" && password.length < MIN_PASSWORD_LENGTH) {
      return setNotice({ kind: "error", text: t("host.weakPassword") });
    }
    if (!password) return setNotice({ kind: "error", text: t("host.wrongCredentials") });
    setNotice(null);
    setBusy(true);
    try {
      await (mode === "signIn" ? auth.signIn(address, password) : auth.signUp(address, password));
    } catch (err) {
      setNotice({ kind: "error", text: hostAuthError(err) });
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (busy) return;
    const address = email.trim();
    if (!isEmail(address)) return setNotice({ kind: "error", text: t("host.invalidEmail") });
    setNotice(null);
    setBusy(true);
    try {
      await auth.resetPassword(address);
    } catch {
      // Neutral on purpose: never reveal whether an account exists for this address.
    } finally {
      setBusy(false);
    }
    setNotice({ kind: "info", text: `${t("host.resetSent")} ${t("host.emailSpamHint")}` });
  };

  const signUp = mode === "signUp";
  return (
    <form className="card stack host-auth" onSubmit={(e) => void submit(e)} noValidate>
      <div className="host-auth__tabs" role="tablist" aria-label={t("host.authModes")}>
        {(["signIn", "signUp"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={`host-auth__tab${mode === m ? " host-auth__tab--active" : ""}`}
            onClick={() => switchMode(m)}
          >
            {t(m === "signIn" ? "host.signIn" : "host.signUp")}
          </button>
        ))}
      </div>
      <label className="field__label" htmlFor="host-email">
        {t("host.email")}
      </label>
      <input
        id="host-email"
        className="text-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label className="field__label" htmlFor="host-password">
        {t("host.password")}
      </label>
      <input
        id="host-password"
        className="text-input"
        type="password"
        autoComplete={signUp ? "new-password" : "current-password"}
        minLength={signUp ? MIN_PASSWORD_LENGTH : undefined}
        aria-describedby={signUp ? "host-password-rule" : undefined}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {signUp && (
        <p id="host-password-rule" className="field__hint">
          {t("host.passwordRule")}
        </p>
      )}
      <NoticeLine notice={notice} />
      <button type="submit" className="btn btn--primary btn--block" disabled={busy} aria-busy={busy}>
        {t(signUp ? "host.submitSignUp" : "host.submitSignIn")}
      </button>
      <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => void forgot()}>
        {t("host.forgotPassword")}
      </button>
    </form>
  );
}

function VerifyEmail({ auth }: { auth: HostAuth }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const run = async (action: () => Promise<Notice>) => {
    if (busy) return;
    setNotice(null);
    setBusy(true);
    try {
      setNotice(await action());
    } catch (err) {
      setNotice({ kind: "error", text: hostAuthError(err) });
    } finally {
      setBusy(false);
    }
  };

  const resend = () =>
    run(async () => {
      await auth.resendVerification();
      return { kind: "info", text: `${t("host.verificationSent")} ${t("host.emailSpamHint")}` };
    });
  const confirm = () =>
    run(async () => ((await auth.refreshVerification()) ? null : { kind: "error", text: t("host.stillUnverified") }));

  return (
    <div className="card stack">
      <h2 className="lead">{t("host.verifyTitle")}</h2>
      <p>{t("host.verifyBody", { email: auth.user?.email ?? "" })}</p>
      <p className="muted">{t("host.emailSpamHint")}</p>
      <NoticeLine notice={notice} />
      <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void confirm()}>
        {t("host.verifiedContinue")}
      </button>
      <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void resend()}>
        {t("host.resendVerification")}
      </button>
      <button type="button" className="btn btn--ghost btn--small" onClick={() => void auth.signOut().catch(() => {})}>
        {t("host.signOut")}
      </button>
    </div>
  );
}

/** Renders children only for a signed-in host with a verified e-mail listed in allowedHosts. */
export function HostGate({ children }: { children: (user: HostUser, signOut: () => Promise<void>) => ReactNode }) {
  const auth = useHostAuth();
  const { status, user, signOut } = auth;
  const [signOutError, setSignOutError] = useState<string | null>(null);

  if (status === "authorized" && user) return <>{children(user, signOut)}</>;

  return (
    <Layout showLogo={false}>
      <section className="gate center stack">
        <Logo className="gate__logo" />
        <h1 className="headline">{t("host.title")}</h1>
        <p className="muted">{club.tagline[club.locale]}</p>
        {status === "loading" && <p className="muted">{t("common.loading")}</p>}
        {status === "signedOut" && <SignInForm auth={auth} />}
        {status === "unverified" && <VerifyEmail auth={auth} />}
        {status === "unauthorized" && (
          <div className="card stack" role="alert">
            <p className="lead">{t("host.notAuthorized", { email: user?.email ?? "" })}</p>
            <p className="muted">{t("host.notAuthorizedHint")}</p>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void signOut().catch((err: unknown) => setSignOutError(friendlyError(err)))}
            >
              {t("host.signOut")}
            </button>
            {signOutError && <p className="field__error">{signOutError}</p>}
          </div>
        )}
      </section>
    </Layout>
  );
}
