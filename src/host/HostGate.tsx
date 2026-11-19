import type { ReactNode } from "react";
import { useHostAuth, type HostUser } from "../game/host";
import { Layout } from "../components/Layout";
import { Logo } from "../components/Logo";
import { club } from "../club.config";
import { t } from "../i18n";

/** Renders children only for a signed-in host listed in allowedHosts. */
export function HostGate({ children }: { children: (user: HostUser, signOut: () => Promise<void>) => ReactNode }) {
  const { status, user, signIn, signOut } = useHostAuth();

  if (status === "authorized" && user) return <>{children(user, signOut)}</>;

  return (
    <Layout showLogo={false}>
      <section className="gate center stack">
        <Logo className="gate__logo" />
        <h1 className="headline">{t("host.title")}</h1>
        <p className="muted">{club.tagline[club.locale]}</p>
        {status === "loading" && <p className="muted">{t("common.loading")}</p>}
        {status === "signedOut" && (
          <button type="button" className="btn btn--primary" onClick={() => void Promise.resolve().then(signIn).catch(() => undefined)}>
            {t("host.signIn")}
          </button>
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
