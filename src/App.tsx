import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { JoinPage } from "./pages/JoinPage";
import { PlayerGame } from "./pages/PlayerGame";
import { t } from "./i18n";

// Host screens (Firestore, Google sign-in) are loaded only when visited.
const HostPage = lazy(() => import("./pages/HostPage").then((m) => ({ default: m.HostPage })));
const HostGame = lazy(() => import("./pages/HostGame").then((m) => ({ default: m.HostGame })));

export function AppRoutes() {
  return (
    <Suspense fallback={<p className="muted center">{t("common.loading")}</p>}>
      <Routes>
        <Route path="/" element={<JoinPage />} />
        <Route path="/play/:pin" element={<PlayerGame />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/host/game/:pin" element={<HostGame />} />
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
