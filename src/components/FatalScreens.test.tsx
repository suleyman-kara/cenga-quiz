import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { translate } from "../i18n";
import { club } from "../club.config";
import { ConfigErrorScreen, ErrorBoundary } from "./FatalScreens";
import { ConfigError } from "../config/firebaseConfig";

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(club.locale, k, v);

function Boom(): never {
  throw new Error("kaboom");
}

describe("fatal screens", () => {
  it("config error screen explains what is missing", () => {
    render(<ConfigErrorScreen error={new ConfigError(["VITE_FIREBASE_APP_ID"])} />);
    expect(screen.getByRole("heading", { name: t("app.configTitle") })).toBeInTheDocument();
    expect(screen.getByText(/VITE_FIREBASE_APP_ID/)).toBeInTheDocument();
  });

  it("ErrorBoundary renders a friendly reload screen instead of a blank page", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: t("app.crashTitle") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("app.reload") })).toBeInTheDocument();
    spy.mockRestore();
  });

  it("ErrorBoundary shows the config screen for a ConfigError", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function BadConfig(): never {
      throw new ConfigError(["VITE_FIREBASE_API_KEY"]);
    }
    render(
      <ErrorBoundary>
        <BadConfig />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: t("app.configTitle") })).toBeInTheDocument();
    spy.mockRestore();
  });
});
