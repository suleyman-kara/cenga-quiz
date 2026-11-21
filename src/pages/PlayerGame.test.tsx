import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { GameState, PlayerScore, PublicQuestion } from "../../shared/types";
import { translate } from "../i18n";
import { club } from "../club.config";
import { PlayerGame } from "./PlayerGame";
import * as hooks from "../game/hooks";
import { fetchOwnAnswer, submitAnswer } from "../game/actions";
import { saveSession } from "../game/session";

vi.mock("../firebase", () => ({ call: vi.fn() }));
vi.mock("../game/actions", () => ({ checkGame: vi.fn(), joinGame: vi.fn(), submitAnswer: vi.fn(), fetchOwnAnswer: vi.fn() }));
vi.mock("../game/hooks", () => ({
  usePlayerUid: vi.fn(),
  useGameState: vi.fn(),
  useMeta: vi.fn(),
  useQuestion: vi.fn(),
  useReveal: vi.fn(),
  useLeaderboard: vi.fn(),
  useMyScore: vi.fn(),
  usePlayers: vi.fn(),
  useAnswerUids: vi.fn(),
  useServerNow: vi.fn(),
  useMyPlayer: vi.fn(),
  useBanned: vi.fn(),
}));
vi.mock("../game/connection", () => ({ useConnectionLost: () => false }));

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
    localStorage.clear();
    saveSession({ pin: "123456", name: "Ayşe" });
    vi.mocked(hooks.useMyPlayer).mockReturnValue({ name: "Ayşe", joinedAt: 1 });
    vi.mocked(hooks.useBanned).mockReturnValue(null);
    vi.mocked(hooks.usePlayerUid).mockReturnValue("u1");
    vi.mocked(hooks.useGameState).mockReturnValue(state("lobby", -1));
    vi.mocked(hooks.useMeta).mockReturnValue(undefined);
    vi.mocked(hooks.useQuestion).mockReturnValue(question);
    vi.mocked(hooks.useReveal).mockReturnValue({ qIndex: 0, correct: 1, counts: [1, 3, 0] });
    vi.mocked(hooks.useLeaderboard).mockReturnValue({ top: [], playerCount: 10 });
    vi.mocked(hooks.useMyScore).mockReturnValue(score());
    vi.mocked(hooks.useServerNow).mockReturnValue(5_000);
    vi.mocked(submitAnswer).mockReset().mockResolvedValue(undefined);
    vi.mocked(fetchOwnAnswer).mockReset().mockResolvedValue(null);
  });

  it("sends players without a session for this PIN back to the join screen", async () => {
    localStorage.clear();
    renderPlay();
    expect(await screen.findByText("JOIN SCREEN")).toBeInTheDocument();
  });

  it("only subscribes to the allowed paths (no players/answers lists)", () => {
    renderPlay();
    expect(hooks.usePlayers).not.toHaveBeenCalled();
    expect(hooks.useAnswerUids).not.toHaveBeenCalled();
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
    localStorage.setItem("quiz.answered.123456.0", "2");
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

  describe("early reveal by the host (countdown still had time left)", () => {
    const tree = () => (
      <MemoryRouter initialEntries={["/play/123456"]}>
        <Routes>
          <Route path="/play/:pin" element={<PlayerGame />} />
        </Routes>
      </MemoryRouter>
    );
    // the reveal patch resets startedAt/endsAt to 0 (idle state) while the phone clock is mid-question
    const revealed = (): GameState => ({ phase: "reveal", qIndex: 0, startedAt: 0, endsAt: 0, updatedAt: 6_000 });

    it("a player who had not answered switches straight to the normal 'no answer' verdict", () => {
      vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
      vi.mocked(hooks.useMyScore).mockReturnValue(score({ lastDelta: 0, lastCorrect: false, lastAnswered: false, streak: 0 }));
      const { rerender } = renderPlay();
      expect(screen.getByRole("timer")).toBeInTheDocument();
      vi.mocked(hooks.useGameState).mockReturnValue(revealed());
      rerender(tree());
      expect(screen.getByText(t("player.noAnswer"))).toBeInTheDocument();
      expect(screen.getByText(/Ankara/)).toBeInTheDocument();
      expect(screen.queryByRole("timer")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /İzmir|Bursa/ })).not.toBeInTheDocument();
      expect(screen.queryByText(t("player.answerRejected"))).not.toBeInTheDocument();
    });

    it("a player who answered sees their verdict", async () => {
      vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
      const { rerender } = renderPlay();
      await userEvent.click(screen.getByRole("button", { name: /Ankara/ }));
      expect(await screen.findByText(t("player.answerLocked"))).toBeInTheDocument();
      vi.mocked(hooks.useGameState).mockReturnValue(revealed());
      rerender(tree());
      expect(screen.getByText(t("player.correct"))).toBeInTheDocument();
      expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    });

    it("an answer still in flight when the reveal lands (then refused by the rules) does not disturb the reveal view", async () => {
      vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
      vi.mocked(hooks.useMyScore).mockReturnValue(score({ lastDelta: 0, lastCorrect: false, lastAnswered: false }));
      let reject!: (e: Error) => void;
      vi.mocked(submitAnswer).mockReturnValue(new Promise<void>((_, r) => (reject = r)));
      const { rerender } = renderPlay();
      await userEvent.click(screen.getByRole("button", { name: /Bursa/ }));
      vi.mocked(hooks.useGameState).mockReturnValue(revealed());
      rerender(tree());
      await act(async () => reject(Object.assign(new Error("PERMISSION_DENIED"), { code: "PERMISSION_DENIED" })));
      expect(screen.getByText(t("player.noAnswer"))).toBeInTheDocument();
      expect(screen.queryByText(t("player.answerRejected"))).not.toBeInTheDocument();
      expect(screen.queryByText(t("player.sendFailed"))).not.toBeInTheDocument();
      expect(localStorage.getItem("quiz.answered.123456.0")).toBeNull();
    });
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

  it("ended: also shows the overall top list", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("ended"));
    vi.mocked(hooks.useLeaderboard).mockReturnValue({
      top: [
        { name: "Ali", score: 3000, rank: 1, correctCount: 3 },
        { name: "Veli", score: 2000, rank: 2, correctCount: 2 },
      ],
      playerCount: 5,
    });
    renderPlay();
    const list = screen.getByRole("list", { name: t("ended.topTitle", { count: 10 }) });
    expect(within(list).getByText("Ali")).toBeInTheDocument();
    expect(within(list).getByText("Veli")).toBeInTheDocument();
  });

  it("shows a not-found message when the game does not exist", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(null);
    renderPlay();
    expect(screen.getByText(t("player.gameGone"))).toBeInTheDocument();
  });

  it("question: shows 'sending' until the write is confirmed, then 'locked'; persists only after success", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
    let resolve!: () => void;
    vi.mocked(submitAnswer).mockReturnValue(new Promise<void>((r) => (resolve = r)));
    renderPlay();
    await userEvent.click(screen.getByRole("button", { name: /Ankara/ }));
    expect(screen.getByText(t("player.sending"))).toBeInTheDocument();
    expect(screen.queryByText(t("player.answerLocked"))).not.toBeInTheDocument();
    expect(localStorage.getItem("quiz.answered.123456.0")).toBeNull();
    await act(async () => resolve());
    expect(screen.getByText(t("player.answerLocked"))).toBeInTheDocument();
    expect(localStorage.getItem("quiz.answered.123456.0")).toBe("1");
  });

  it("question: a failed write before endsAt allows a retry", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
    vi.mocked(submitAnswer)
      .mockRejectedValueOnce(Object.assign(new Error("PERMISSION_DENIED: Permission denied"), { code: "PERMISSION_DENIED" }))
      .mockResolvedValue(undefined);
    renderPlay();
    await userEvent.click(screen.getByRole("button", { name: /Ankara/ }));
    expect(await screen.findByText(t("player.sendFailed"))).toBeInTheDocument();
    expect(localStorage.getItem("quiz.answered.123456.0")).toBeNull();
    const again = screen.getByRole("button", { name: /Bursa/ });
    expect(again).toBeEnabled();
    await userEvent.click(again);
    expect(submitAnswer).toHaveBeenCalledTimes(2);
    expect(submitAnswer).toHaveBeenLastCalledWith("123456", 0, 2);
    expect(await screen.findByText(t("player.answerLocked"))).toBeInTheDocument();
  });

  it("question: PERMISSION_DENIED after time is up says the answer was not received", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
    let reject!: (e: Error) => void;
    vi.mocked(submitAnswer).mockReturnValue(new Promise<void>((_, r) => (reject = r)));
    const { rerender } = renderPlay();
    await userEvent.click(screen.getByRole("button", { name: /Ankara/ }));
    vi.mocked(hooks.useServerNow).mockReturnValue(22_000);
    rerender(
      <MemoryRouter initialEntries={["/play/123456"]}>
        <Routes>
          <Route path="/play/:pin" element={<PlayerGame />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => reject(Object.assign(new Error("PERMISSION_DENIED"), { code: "PERMISSION_DENIED" })));
    expect(screen.getByText(t("player.answerRejected"))).toBeInTheDocument();
    expect(screen.queryByText(t("player.answerLocked"))).not.toBeInTheDocument();
    for (const b of screen.getAllByRole("button", { name: /İzmir|Ankara|Bursa/ })) expect(b).toBeDisabled();
  });

  it("question: vibrates briefly on answer when supported", async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
    renderPlay();
    await userEvent.click(screen.getByRole("button", { name: /Ankara/ }));
    expect(vibrate).toHaveBeenCalledWith(30);
    delete (navigator as unknown as { vibrate?: unknown }).vibrate;
  });

  it("lead-in: before startedAt shows 'get ready' with a countdown and no options yet", () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...state("question"), startedAt: 7_000, endsAt: 27_000 });
    vi.mocked(hooks.useServerNow).mockReturnValue(5_000);
    renderPlay();
    expect(screen.getByText(t("player.getReady"))).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /İzmir|Ankara|Bursa/ })).toHaveLength(0);
    expect(submitAnswer).not.toHaveBeenCalled();
  });

  it("announces the countdown politely only at 10 and 5 seconds", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
    vi.mocked(hooks.useServerNow).mockReturnValue(12_000); // 9 s left
    renderPlay();
    const live = document.querySelector('[aria-live="polite"][data-countdown-announcer]');
    expect(live).toHaveTextContent(t("hostGame.secondsLeft", { seconds: 10 }));
  });

  it("shows a 'calculating' hint while the server holds the transition lock", () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...state("question"), lock: { by: "reveal", at: 4_900 } });
    renderPlay();
    expect(screen.getByText(t("common.computing"))).toBeInTheDocument();
  });

  it("shows the name from the player's own server entry (the server may rename it)", () => {
    vi.mocked(hooks.useMyPlayer).mockReturnValue({ name: "Ayşe (2)", joinedAt: 1 });
    renderPlay();
    expect(screen.getByText("Ayşe (2)")).toBeInTheDocument();
  });

  it("kicked: shows the removed screen", () => {
    vi.mocked(hooks.useBanned).mockReturnValue(true);
    vi.mocked(hooks.useMyPlayer).mockReturnValue(null);
    vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
    vi.mocked(hooks.useQuestion).mockReturnValue(null);
    renderPlay();
    expect(screen.getByText(t("player.kicked"))).toBeInTheDocument();
  });

  it("removed at start (no own player entry any more): shows the removed screen", () => {
    vi.mocked(hooks.useMyPlayer).mockReturnValue(null);
    vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
    renderPlay();
    expect(screen.getByText(t("player.kicked"))).toBeInTheDocument();
  });

  it("reveal result is a status region", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("reveal"));
    renderPlay();
    expect(screen.getByText(t("player.correct")).closest('[role="status"]')).not.toBeNull();
  });
  describe("answer verification (server accepted, ack lost)", () => {
    const denied = () => Object.assign(new Error("PERMISSION_DENIED: Permission denied"), { code: "PERMISSION_DENIED" });
    afterEach(() => vi.useRealTimers());

    it("PERMISSION_DENIED but the server has our answer: shows it as sent (with the server's choice)", async () => {
      vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
      vi.mocked(submitAnswer).mockRejectedValue(denied());
      renderPlay();
      vi.mocked(fetchOwnAnswer).mockResolvedValue(1);
      await userEvent.click(screen.getByRole("button", { name: /Ankara/ }));
      expect(await screen.findByText(t("player.answerLocked"))).toBeInTheDocument();
      expect(screen.queryByText(t("player.sendFailed"))).not.toBeInTheDocument();
      expect(fetchOwnAnswer).toHaveBeenCalledWith("123456", 0);
      expect(localStorage.getItem("quiz.answered.123456.0")).toBe("1");
    });

    it("after a reload without the local mark, restores the answer the server already has", async () => {
      vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
      vi.mocked(fetchOwnAnswer).mockResolvedValue(2);
      renderPlay();
      expect(await screen.findByText(t("player.answerLocked"))).toBeInTheDocument();
      expect(screen.getByText("Bursa", { selector: ".locked__choice" })).toBeInTheDocument();
      for (const b of screen.getAllByRole("button", { name: /İzmir|Ankara|Bursa/ })) expect(b).toBeDisabled();
    });

    it("a write still pending after 8 s is verified; if absent, offers a retry", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
      vi.mocked(submitAnswer).mockReturnValue(new Promise<void>(() => {}));
      renderPlay();
      await act(async () => {});
      vi.mocked(fetchOwnAnswer).mockClear();
      await userEvent.click(screen.getByRole("button", { name: /Ankara/ }));
      expect(screen.getByText(t("player.sending"))).toBeInTheDocument();
      await act(async () => void (await vi.advanceTimersByTimeAsync(8_000)));
      expect(fetchOwnAnswer).toHaveBeenCalledTimes(1);
      expect(await screen.findByText(t("player.sendFailed"))).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Bursa/ })).toBeEnabled();
    });

    it("a write still pending after 8 s that the server did record shows as sent", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
      vi.mocked(submitAnswer).mockReturnValue(new Promise<void>(() => {}));
      renderPlay();
      await act(async () => {});
      vi.mocked(fetchOwnAnswer).mockResolvedValue(1);
      await userEvent.click(screen.getByRole("button", { name: /Ankara/ }));
      await act(async () => void (await vi.advanceTimersByTimeAsync(8_000)));
      expect(await screen.findByText(t("player.answerLocked"))).toBeInTheDocument();
    });
  });
});
