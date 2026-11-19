import { Component, type ErrorInfo, type ReactNode } from "react";
import { ConfigError } from "../config/firebaseConfig";
import { Logo } from "./Logo";
import { t } from "../i18n";

function FatalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="layout layout--app">
      <main className="layout__main">
        <section className="fatal center stack" role="alert">
          <Logo className="fatal__logo" />
          <h1 className="headline">{title}</h1>
          {children}
        </section>
      </main>
    </div>
  );
}

/** Production build without Firebase settings (see docs/firebase-kurulum.md). */
export function ConfigErrorScreen({ error }: { error: ConfigError }) {
  return (
    <FatalShell title={t("app.configTitle")}>
      <p className="lead muted">{t("app.configBody")}</p>
      <p className="fatal__detail">{t("app.configMissing", { keys: error.missing.join(", ") })}</p>
    </FatalShell>
  );
}

export function CrashScreen() {
  return (
    <FatalShell title={t("app.crashTitle")}>
      <p className="lead muted">{t("app.crashBody")}</p>
      <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
        {t("app.reload")}
      </button>
    </FatalShell>
  );
}

/** Top-level boundary: a render error shows a reload screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return error instanceof ConfigError ? <ConfigErrorScreen error={error} /> : <CrashScreen />;
  }
}
