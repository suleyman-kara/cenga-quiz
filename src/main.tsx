import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { club } from "./club.config";
import { applyTheme } from "./theme/applyTheme";
import App from "./App";
import "./styles/base.css";
import "./styles/player.css";
import "./styles/stage.css";

applyTheme(club);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
