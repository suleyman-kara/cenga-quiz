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
import { loadLastSession, loadSession, saveSession } from "../game/session";

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
  useHostOnline: vi.fn(),
}));
const conn = vi.hoisted(() => ({ lost: false }));
vi.mock("../game/connection", () => ({ useConnectionLost: () => conn.lost }));

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
    conn.lost = false;
    vi.mocked(hooks.useHostOnline).mockReturnValue(true);
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

  it("reveal: a short double buzz when correct, one longer buzz when wrong, none without an answer", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    vi.mocked(hooks.useGameState).mockReturnValue(state("reveal"));
    const first = renderPlay();
    expect(vibrate).toHaveBeenCalledTimes(1);
    const correctPattern = vibrate.mock.calls[0][0] as number[];
    expect(Array.isArray(correctPattern)).toBe(true);
    first.unmount();

    vibrate.mockClear();
    vi.mocked(hooks.useMyScore).mockReturnValue(score({ lastCorrect: false, lastDelta: 0, streak: 0 }));
    const second = renderPlay();
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate.mock.calls[0][0]).not.toEqual(correctPattern);
    second.unmount();

    vibrate.mockClear();
    vi.mocked(hooks.useMyScore).mockReturnValue(score({ lastCorrect: false, lastAnswered: false, lastDelta: 0 }));
    renderPlay();
    expect(vibrate).not.toHaveBeenCalled();
    delete (navigator as unknown as { vibrate?: unknown }).vibrate;
  });

  it("reveal: no vibration API, no problem", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("reveal"));
    expect(() => renderPlay()).not.toThrow();
    expect(screen.getByText(t("player.correct"))).toBeInTheDocument();
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
    expect(live).toHaveTextContent(t("player.secondsLeft", { seconds: 10 }));
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

  it("reveal: says how many places the player moved up", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("reveal"));
    vi.mocked(hooks.useMyScore).mockReturnValue(score({ rank: 3, prevRank: 5 }));
    renderPlay();
    expect(screen.getByText(t("player.movedUp", { count: 2 }))).toBeInTheDocument();
  });

  it("leaderboard: says how many places the player moved down", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("leaderboard"));
    vi.mocked(hooks.useMyScore).mockReturnValue(score({ rank: 4, prevRank: 3 }));
    renderPlay();
    expect(screen.getByText(t("player.movedDown", { count: 1 }))).toBeInTheDocument();
  });

  it("no movement line when the rank is unchanged or unknown", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("leaderboard"));
    vi.mocked(hooks.useMyScore).mockReturnValue(score({ rank: 3, prevRank: 3 }));
    const { unmount } = renderPlay();
    expect(screen.queryByText(/▲|▼/)).not.toBeInTheDocument();
    unmount();
    vi.mocked(hooks.useGameState).mockReturnValue(state("reveal"));
    vi.mocked(hooks.useMyScore).mockReturnValue(score({ rank: 3 }));
    renderPlay();
    expect(screen.queryByText(/▲|▼/)).not.toBeInTheDocument();
  });

  it("double-points question: shows the 2× badge (lead-in and answering)", () => {
    vi.mocked(hooks.useQuestion).mockReturnValue({ ...question, double: true });
    vi.mocked(hooks.useGameState).mockReturnValue({ ...state("question"), startedAt: 7_000, endsAt: 27_000 });
    vi.mocked(hooks.useServerNow).mockReturnValue(5_000);
    const { unmount } = renderPlay();
    expect(screen.getByText(t("question.double"))).toBeInTheDocument();
    unmount();
    vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
    renderPlay();
    expect(screen.getByText(t("question.double"))).toBeInTheDocument();
  });

  it("normal question: no 2× badge", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
    renderPlay();
    expect(screen.queryByText(t("question.double"))).not.toBeInTheDocument();
  });
  it("reveal (correct): full-screen colour flash and confetti", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("reveal"));
    renderPlay();
    expect(document.querySelector(".verdict-flash")).not.toBeNull();
    expect(document.querySelector(".confetti")).not.toBeNull();
  });

  it("reveal (wrong): no flash, no confetti", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("reveal"));
    vi.mocked(hooks.useMyScore).mockReturnValue(score({ lastCorrect: false, lastDelta: 0, streak: 0 }));
    renderPlay();
    expect(document.querySelector(".verdict-flash")).toBeNull();
    expect(document.querySelector(".confetti")).toBeNull();
  });

  it("reveal: a streak of 3+ is 'on fire' (extra animation hook + text); 2 is not", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("reveal"));
    vi.mocked(hooks.useMyScore).mockReturnValue(score({ streak: 3 }));
    const { unmount } = renderPlay();
    expect(screen.getByRole("status")).toHaveAttribute("data-hot");
    expect(screen.getByText(t("player.onFire"))).toBeInTheDocument();
    unmount();
    vi.mocked(hooks.useMyScore).mockReturnValue(score({ streak: 2 }));
    renderPlay();
    expect(screen.getByRole("status")).not.toHaveAttribute("data-hot");
    expect(screen.queryByText(t("player.onFire"))).not.toBeInTheDocument();
  });

  it("double-points question tints the screen edge; a normal one does not", () => {
    vi.mocked(hooks.useQuestion).mockReturnValue({ ...question, double: true });
    vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
    const { unmount } = renderPlay();
    expect(document.querySelector(".double-edge")).not.toBeNull();
    unmount();
    vi.mocked(hooks.useQuestion).mockReturnValue(question);
    renderPlay();
    expect(document.querySelector(".double-edge")).toBeNull();
  });

  describe("keeps the phone awake", () => {
    afterEach(() => {
      delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    });
    const fake = () => {
      const request = vi.fn(async () => ({ release: vi.fn(async () => {}), addEventListener: vi.fn() }));
      Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
      return request;
    };

    it("requests a screen wake lock while the game runs", async () => {
      const request = fake();
      renderPlay();
      await act(async () => {});
      expect(request).toHaveBeenCalledWith("screen");
    });

    it("does not hold the screen awake once the game ended", async () => {
      const request = fake();
      vi.mocked(hooks.useGameState).mockReturnValue(state("ended"));
      renderPlay();
      await act(async () => {});
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe("finished games do not capture the join screen", () => {
    it("ended: a new visit to the join screen is not redirected here any more", () => {
      vi.mocked(hooks.useGameState).mockReturnValue(state("ended"));
      renderPlay();
      expect(loadLastSession()).toBeNull();
      expect(loadSession("123456")).not.toBeNull();
    });

    it("game gone: same", () => {
      vi.mocked(hooks.useGameState).mockReturnValue(null);
      renderPlay();
      expect(loadLastSession()).toBeNull();
    });

    it("a running game stays the one to return to", () => {
      vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
      renderPlay();
      expect(loadLastSession()?.pin).toBe("123456");
    });
  });

  describe("connection lost while answering", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("question: says the answer will be sent when the connection is back", () => {
      conn.lost = true;
      vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
      renderPlay();
      expect(screen.getByText(t("player.offlineAnswerHint"))).toBeInTheDocument();
    });

    it("a tap while offline waits for the connection instead of failing after 8 s", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      conn.lost = true;
      vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
      let resolve!: () => void;
      vi.mocked(submitAnswer).mockReturnValue(new Promise<void>((r) => (resolve = r)));
      const view = renderPlay();
      await act(async () => {});
      vi.mocked(fetchOwnAnswer).mockClear();
      await userEvent.click(screen.getByRole("button", { name: /Ankara/ }));
      expect(screen.getByText(t("player.sendingOffline"))).toBeInTheDocument();
      await act(async () => void (await vi.advanceTimersByTimeAsync(12_000)));
      expect(screen.queryByText(t("player.sendFailed"))).not.toBeInTheDocument();
      expect(fetchOwnAnswer).not.toHaveBeenCalled();
      // back online: the queued write lands
      conn.lost = false;
      view.rerender(
        <MemoryRouter initialEntries={["/play/123456"]}>
          <Routes>
            <Route path="/play/:pin" element={<PlayerGame />} />
          </Routes>
        </MemoryRouter>,
      );
      await act(async () => resolve());
      expect(await screen.findByText(t("player.answerLocked"))).toBeInTheDocument();
    });
  });

  it("announces each new question to screen readers", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
    renderPlay();
    const live = document.querySelector("[data-phase-announcer]");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent(`${t("player.questionN", { n: 1 })}: Başkent?`);
  });

  describe("host connection", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("tells the players when the host has been gone for a while during the game", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.mocked(hooks.useGameState).mockReturnValue(state("question"));
      vi.mocked(hooks.useHostOnline).mockReturnValue(null);
      renderPlay();
      expect(screen.queryByText(t("player.hostAway"))).not.toBeInTheDocument();
      await act(async () => void (await vi.advanceTimersByTimeAsync(10_500)));
      expect(screen.getByText(t("player.hostAway"))).toBeInTheDocument();
    });

    it("no notice while the host is connected, in the lobby, or once the game ended", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.mocked(hooks.useGameState).mockReturnValue(state("reveal"));
      const { unmount } = renderPlay();
      await act(async () => void (await vi.advanceTimersByTimeAsync(11_000)));
      expect(screen.queryByText(t("player.hostAway"))).not.toBeInTheDocument();
      unmount();
      vi.mocked(hooks.useHostOnline).mockReturnValue(null);
      for (const phase of ["lobby", "ended"] as const) {
        vi.mocked(hooks.useGameState).mockReturnValue(state(phase, phase === "lobby" ? -1 : 0));
        const v = renderPlay();
        await act(async () => void (await vi.advanceTimersByTimeAsync(11_000)));
        expect(screen.queryByText(t("player.hostAway"))).not.toBeInTheDocument();
        v.unmount();
      }
    });
  });
});

