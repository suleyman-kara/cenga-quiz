import { useState, type ReactNode } from "react";
import { useHostAuth, type HostUser } from "../game/host";
import { Layout } from "../components/Layout";
import { Logo } from "../components/Logo";
import { club } from "../club.config";
import { t } from "../i18n";
import { friendlyError, isSilentAuthError } from "../errors";

/** Renders children only for a signed-in host listed in allowedHosts. */
export function HostGate({ children }: { children: (user: HostUser, signOut: () => Promise<void>) => ReactNode }) {
  const { status, user, signIn, signOut } = useHostAuth();
  const [error, setError] = useState<string | null>(null);

  const startSignIn = () => {
    setError(null);
    void Promise.resolve()
      .then(signIn)
      .catch((err: unknown) => {
        if (!isSilentAuthError(err)) setError(friendlyError(err));
      });
  };

  if (status === "authorized" && user) return <>{children(user, signOut)}</>;

  return (
    <Layout showLogo={false}>
      <section className="gate center stack">
        <Logo className="gate__logo" />
        <h1 className="headline">{t("host.title")}</h1>
        <p className="muted">{club.tagline[club.locale]}</p>
        {status === "loading" && <p className="muted">{t("common.loading")}</p>}
        {status === "signedOut" && (
          <button type="button" className="btn btn--primary" onClick={startSignIn}>
            {t("host.signIn")}
          </button>
        )}
        {status === "signedOut" && error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        {status === "unauthorized" && (
          <div className="card stack" role="alert">
            <p className="lead">{t("host.notAuthorized", { email: user?.email ?? "" })}</p>
            <p className="muted">{t("host.notAuthorizedHint")}</p>
            <button type="button" className="btn btn--ghost" onClick={() => void signOut()}>
              {t("host.signOut")}
            </button>
          </div>
        )}
      </section>
    </Layout>
  );
}
