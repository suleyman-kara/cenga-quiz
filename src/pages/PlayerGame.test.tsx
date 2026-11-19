import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { GameState, PlayerScore, PublicQuestion } from "../../shared/types";
import { translate } from "../i18n";
import { club } from "../club.config";
import { PlayerGame } from "./PlayerGame";
import * as hooks from "../game/hooks";
import { submitAnswer } from "../game/actions";

vi.mock("../firebase", () => ({ call: vi.fn() }));
vi.mock("../game/actions", () => ({ checkGame: vi.fn(), joinGame: vi.fn(), submitAnswer: vi.fn() }));
vi.mock("../game/hooks", () => ({
  usePlayerUid: vi.fn(),
  useGameState: vi.fn(),
  useMeta: vi.fn(),
  useQuestion: vi.fn(),
  useReveal: vi.fn(),
  useLeaderboard: vi.fn(),
  useMyScore: vi.fn(),
  usePlayers: vi.fn(),
  useAnswerCount: vi.fn(),
  useServerNow: vi.fn(),
}));

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(club.locale, k, v);

const state = (phase: GameState["phase"], qIndex = 0): GameState => ({
  phase,
  qIndex,
  startedAt: 1_000,
  endsAt: phase === "question" ? 21_000 : 0,
  updatedAt: 1_000,
});
const question: PublicQuestion = { index: 0, text: "Başkent?", options: ["İzmir", "Ankara", "Bursa"], seconds: 20 };
const score = (p: Partial<PlayerScore> = {}): PlayerScore => ({
  score: 1850,
  streak: 2,
  rank: 3,
  lastDelta: 850,
  lastCorrect: true,
  lastAnswered: true,
  correctCount: 2,
  ...p,
});

function renderPlay() {
  return render(
    <MemoryRouter initialEntries={["/play/123456"]}>
      <Routes>
        <Route path="/" element={<div>JOIN SCREEN</div>} />
        <Route path="/play/:pin" element={<PlayerGame />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PlayerGame", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("quiz.session", JSON.stringify({ pin: "123456", name: "Ayşe" }));
    vi.mocked(hooks.usePlayerUid).mockReturnValue("u1");
    vi.mocked(hooks.useGameState).mockReturnValue(state("lobby", -1));
    vi.mocked(hooks.useMeta).mockReturnValue(undefined);
    vi.mocked(hooks.useQuestion).mockReturnValue(question);
    vi.mocked(hooks.useReveal).mockReturnValue({ qIndex: 0, correct: 1, counts: [1, 3, 0] });
    vi.mocked(hooks.useLeaderboard).mockReturnValue({ top: [], playerCount: 10 });
    vi.mocked(hooks.useMyScore).mockReturnValue(score());
    vi.mocked(hooks.useServerNow).mockReturnValue(5_000);
    vi.mocked(submitAnswer).mockReset().mockResolvedValue(undefined);
  });

  it("sends players without a session for this PIN back to the join screen", async () => {
    sessionStorage.clear();
    renderPlay();
    expect(await screen.findByText("JOIN SCREEN")).toBeInTheDocument();
  });

  it("only subscribes to the allowed paths (no players/answers lists)", () => {
    renderPlay();
    expect(hooks.usePlayers).not.toHaveBeenCalled();
    expect(hooks.useAnswerCount).not.toHaveBeenCalled();
    expect(hooks.useMyScore).toHaveBeenCalledWith("123456", "u1");
  });

  it("lobby: tells the player to look at the big screen and shows their name", () => {
    renderPlay();
    expect(screen.getByText(t("player.lobbyTitle"))).toBeInTheDocument();
    expect(screen.getByText(t("player.lobbyHint"))).toBeInTheDocument();
    expect(screen.getByText("Ayşe")).toBeInTheDocument();
  });

  it("question: shows a button per option and locks after one answer", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
    renderPlay();
    const buttons = screen.getAllByRole("button", { name: /İzmir|Ankara|Bursa/ });
    expect(buttons).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: /Ankara/ }));
    expect(submitAnswer).toHaveBeenCalledTimes(1);
    expect(submitAnswer).toHaveBeenCalledWith("123456", 0, 1);
    expect(await screen.findByText(t("player.answerLocked"))).toBeInTheDocument();
    for (const b of screen.queryAllByRole("button", { name: /İzmir|Ankara|Bursa/ })) expect(b).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /İzmir/ }));
    expect(submitAnswer).toHaveBeenCalledTimes(1);
  });

  it("question: remembers the answer after a refresh", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
    sessionStorage.setItem("quiz.answered.123456.0", "2");
    renderPlay();
    expect(screen.getByText(t("player.answerLocked"))).toBeInTheDocument();
  });

  it("question: when time is up without an answer, buttons are disabled", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
    vi.mocked(hooks.useServerNow).mockReturnValue(30_000);
    renderPlay();
    for (const b of screen.getAllByRole("button", { name: /İzmir|Ankara|Bursa/ })) expect(b).toBeDisabled();
  });

  it("reveal (correct): shows correct + points gained + streak", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("reveal"));
    renderPlay();
    expect(screen.getByText(t("player.correct"))).toBeInTheDocument();
    expect(screen.getByText(t("player.points", { points: 850 }))).toBeInTheDocument();
    expect(screen.getByText(t("player.streak", { streak: 2 }))).toBeInTheDocument();
  });

  it("reveal (wrong): shows incorrect, +0 and the correct option", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("reveal"));
    vi.mocked(hooks.useMyScore).mockReturnValue(score({ lastCorrect: false, lastDelta: 0, streak: 0 }));
    renderPlay();
    expect(screen.getByText(t("player.wrong"))).toBeInTheDocument();
    expect(screen.getByText(t("player.points", { points: 0 }))).toBeInTheDocument();
    expect(screen.getByText(/Ankara/)).toBeInTheDocument();
  });

  it("reveal (no answer): says time ran out", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("reveal"));
    vi.mocked(hooks.useMyScore).mockReturnValue(score({ lastCorrect: false, lastAnswered: false, lastDelta: 0 }));
    renderPlay();
    expect(screen.getByText(t("player.noAnswer"))).toBeInTheDocument();
  });

  it("leaderboard: shows own rank and score", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("leaderboard"));
    renderPlay();
    expect(screen.getByText(t("player.rank", { rank: 3 }))).toBeInTheDocument();
    expect(screen.getByText(t("player.score", { score: 1850 }))).toBeInTheDocument();
  });

  it("ended: shows final rank and the club's final screen text", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("ended"));
    renderPlay();
    expect(screen.getByText(t("player.finalRank", { rank: 3 }))).toBeInTheDocument();
    expect(screen.getByText(club.finalScreen[club.locale].title)).toBeInTheDocument();
    expect(screen.getByText(club.finalScreen[club.locale].message)).toBeInTheDocument();
  });

  it("shows a not-found message when the game does not exist", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(null);
    renderPlay();
    expect(screen.getByText(t("player.gameGone"))).toBeInTheDocument();
  });
});
