import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { club } from "./club.config";
import { applyTheme } from "./theme/applyTheme";
import { ConfigError } from "./config/firebaseConfig";
import { ConfigErrorScreen, CrashScreen, ErrorBoundary } from "./components/FatalScreens";
import "./styles/base.css";
import "./styles/player.css";
import "./styles/stage.css";

applyTheme(club);

const root = createRoot(document.getElementById("root")!);
const render = (node: ReactNode) =>
  root.render(
    <StrictMode>
      <ErrorBoundary>{node}</ErrorBoundary>
    </StrictMode>,
  );

// The app (and firebase.ts with it) is imported dynamically: a ConfigError thrown while the
// Firebase module evaluates becomes a friendly screen instead of a blank page.
import("./App")
  .then(({ default: App }) => render(<App />))
  .catch((err: unknown) => {
    console.error(err);
    render(err instanceof ConfigError ? <ConfigErrorScreen error={err} /> : <CrashScreen />);
  });
