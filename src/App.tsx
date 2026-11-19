import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { isValidPin } from "../shared/pin";
import { JoinPage } from "./pages/JoinPage";
import { PlayerGame } from "./pages/PlayerGame";
import { t } from "./i18n";

// Host screens (Firestore, Google sign-in) are loaded only when visited.
const HostPage = lazy(() => import("./pages/HostPage").then((m) => ({ default: m.HostPage })));
const HostGame = lazy(() => import("./pages/HostGame").then((m) => ({ default: m.HostGame })));
const QuizEditor = lazy(() => import("./pages/QuizEditor").then((m) => ({ default: m.QuizEditor })));

/** Renders `children` only for a well-formed :pin; anything else goes home with a message. */
function ValidPin({ children }: { children: ReactNode }) {
  const { pin = "" } = useParams();
  if (!isValidPin(pin)) return <Navigate to="/?invalid=1" replace />;
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<p className="muted center">{t("common.loading")}</p>}>
      <Routes>
        <Route path="/" element={<JoinPage />} />
        <Route
          path="/play/:pin"
          element={
            <ValidPin>
              <PlayerGame />
            </ValidPin>
          }
        />
        <Route path="/host" element={<HostPage />} />
        <Route path="/host/quiz/:id" element={<QuizEditor />} />
        <Route
          path="/host/game/:pin"
          element={
            <ValidPin>
              <HostGame />
            </ValidPin>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
