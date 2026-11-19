import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { GameState, PublicQuestion } from "../../shared/types";
import { translate } from "../i18n";
import { club } from "../club.config";
import { HostGame } from "./HostGame";
import * as hooks from "../game/hooks";
import { call } from "../firebase";

vi.mock("../firebase", () => ({ call: vi.fn() }));
vi.mock("../game/host", () => ({
  useHostAuth: () => ({
    status: "authorized",
    user: { uid: "h1", email: "host@example.org", displayName: "Host" },
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
  useMyQuizzes: vi.fn(),
  saveQuiz: vi.fn(),
}));
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

const qState = (qIndex = 0): GameState => ({ phase: "question", qIndex, startedAt: 0, endsAt: 20_000, updatedAt: 0 });
const question = (index = 0): PublicQuestion => ({ index, text: "Başkent?", options: ["İzmir", "Ankara"], seconds: 20 });
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ uid: `u${i}`, name: `Oyuncu ${i}`, joinedAt: i }));

function renderHost() {
  return render(
    <MemoryRouter initialEntries={["/host/game/123456"]}>
      <Routes>
        <Route path="/host/game/:pin" element={<HostGame />} />
      </Routes>
    </MemoryRouter>,
  );
}

const revealCalls = () => vi.mocked(call).mock.calls.filter(([name]) => name === "reveal");

describe("HostGame", () => {
  beforeEach(() => {
    vi.mocked(call).mockReset().mockResolvedValue({ ok: true });
    vi.mocked(hooks.useMeta).mockReturnValue({ hostUid: "h1", quizId: "q", title: "Genel kültür", createdAt: 0, questionCount: 3 });
    vi.mocked(hooks.useGameState).mockReturnValue({ phase: "lobby", qIndex: -1, startedAt: 0, endsAt: 0, updatedAt: 0 });
    vi.mocked(hooks.useQuestion).mockReturnValue(null);
    vi.mocked(hooks.useReveal).mockReturnValue(null);
    vi.mocked(hooks.useLeaderboard).mockReturnValue(null);
    vi.mocked(hooks.usePlayers).mockReturnValue(players(2));
    vi.mocked(hooks.useAnswerCount).mockReturnValue(0);
    vi.mocked(hooks.useServerNow).mockReturnValue(5_000);
  });

  it("lobby: shows the PIN, join URL, player names and count; Start calls startGame", async () => {
    renderHost();
    expect(screen.getByText("123456")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(window.location.host.replace(/[.:]/g, "\\$&")))).toBeInTheDocument();
    expect(screen.getByText("Oyuncu 0")).toBeInTheDocument();
    expect(screen.getByText("Oyuncu 1")).toBeInTheDocument();
    expect(screen.getByText(t("hostGame.players", { count: 2 }))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.start") }));
    expect(call).toHaveBeenCalledWith("startGame", { pin: "123456" });
  });

  it("lobby: Start is disabled without players", () => {
    vi.mocked(hooks.usePlayers).mockReturnValue([]);
    renderHost();
    expect(screen.getByRole("button", { name: t("hostGame.start") })).toBeDisabled();
  });

  it("question: shows text, options and x / y answered; no reveal while time remains", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(qState());
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    vi.mocked(hooks.useAnswerCount).mockReturnValue(1);
    renderHost();
    expect(screen.getByText("Başkent?")).toBeInTheDocument();
    expect(screen.getByText("Ankara")).toBeInTheDocument();
    expect(screen.getByText(t("hostGame.answered", { answered: 1, total: 2 }))).toBeInTheDocument();
    expect(hooks.useAnswerCount).toHaveBeenCalledWith("123456", 0);
    expect(revealCalls()).toHaveLength(0);
  });

  it("auto-reveals exactly once when time is up", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue(qState());
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    vi.mocked(hooks.useServerNow).mockReturnValue(20_500);
    const { rerender } = renderHost();
    await waitFor(() => expect(revealCalls()).toHaveLength(1));
    expect(revealCalls()[0][1]).toEqual({ pin: "123456" });
    vi.mocked(hooks.useServerNow).mockReturnValue(21_500);
    rerender(
      <MemoryRouter initialEntries={["/host/game/123456"]}>
        <Routes>
          <Route path="/host/game/:pin" element={<HostGame />} />
        </Routes>
      </MemoryRouter>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(revealCalls()).toHaveLength(1);
  });

  it("auto-reveals exactly once when all players answered", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue(qState());
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    vi.mocked(hooks.useAnswerCount).mockReturnValue(2);
    renderHost();
    await waitFor(() => expect(revealCalls()).toHaveLength(1));
    // manual button afterwards must not double-call
    const btn = screen.getByRole("button", { name: t("hostGame.reveal") });
    expect(btn).toBeDisabled();
    await new Promise((r) => setTimeout(r, 20));
    expect(revealCalls()).toHaveLength(1);
  });

  it("manual Reveal calls reveal once and prevents a later auto-reveal", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue(qState());
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    const { rerender } = renderHost();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.reveal") }));
    expect(revealCalls()).toHaveLength(1);
    vi.mocked(hooks.useServerNow).mockReturnValue(25_000);
    rerender(
      <MemoryRouter initialEntries={["/host/game/123456"]}>
        <Routes>
          <Route path="/host/game/:pin" element={<HostGame />} />
        </Routes>
      </MemoryRouter>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(revealCalls()).toHaveLength(1);
  });

  it("shows the callable error message", async () => {
    vi.mocked(call).mockRejectedValue(new Error("boom"));
    renderHost();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.start") }));
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });

  it("reveal: shows the distribution counts and a button to the leaderboard", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(), phase: "reveal" });
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    vi.mocked(hooks.useReveal).mockReturnValue({ qIndex: 0, correct: 1, counts: [4, 7] });
    renderHost();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Ankara").closest("[data-correct]")).toHaveAttribute("data-correct", "true");
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.showLeaderboard") }));
    expect(call).toHaveBeenCalledWith("showLeaderboard", { pin: "123456" });
  });

  it("leaderboard: shows top 5 and Next; last question offers End", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(0), phase: "leaderboard" });
    vi.mocked(hooks.useLeaderboard).mockReturnValue({
      top: [
        { name: "Ali", score: 900, rank: 1 },
        { name: "Veli", score: 800, rank: 2 },
      ],
      playerCount: 2,
    });
    const { unmount } = renderHost();
    expect(screen.getByText("Ali")).toBeInTheDocument();
    expect(screen.getByText("Veli")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.next") }));
    expect(call).toHaveBeenCalledWith("nextQuestion", { pin: "123456" });
    unmount();

    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(2), phase: "leaderboard" });
    renderHost();
    expect(screen.queryByRole("button", { name: t("hostGame.next") })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.end") }));
    expect(call).toHaveBeenCalledWith("endGame", { pin: "123456" });
  });

  it("ended: podium with top 3, club final text and logo", () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(2), phase: "ended" });
    vi.mocked(hooks.useLeaderboard).mockReturnValue({
      top: [
        { name: "Ali", score: 900, rank: 1 },
        { name: "Veli", score: 800, rank: 2 },
        { name: "Can", score: 700, rank: 3 },
        { name: "Dördüncü", score: 100, rank: 4 },
      ],
      playerCount: 4,
    });
    renderHost();
    expect(screen.getByText("Ali")).toBeInTheDocument();
    expect(screen.getByText("Can")).toBeInTheDocument();
    expect(screen.queryByText("Dördüncü")).not.toBeInTheDocument();
    expect(screen.getByText(club.finalScreen[club.locale].title)).toBeInTheDocument();
    expect(screen.getByAltText(club.logo.alt)).toBeInTheDocument();
  });
});
