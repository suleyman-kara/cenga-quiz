import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { GameState, PublicQuestion } from "../../shared/types";
import { translate } from "../i18n";
import { club } from "../club.config";
import { HostGame } from "./HostGame";
import * as hooks from "../game/hooks";
import { hostCall } from "../firebase";

vi.mock("../firebase", () => ({ hostCall: vi.fn() }));
vi.mock("../game/connection", () => ({ useConnectionLost: () => false }));
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
  useAnswerUids: vi.fn(),
  useServerNow: vi.fn(),
}));

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(club.locale, k, v);

const qState = (qIndex = 0): GameState => ({ phase: "question", qIndex, startedAt: 0, endsAt: 20_000, updatedAt: 0 });
const question = (index = 0): PublicQuestion => ({ index, text: "Başkent?", options: ["İzmir", "Ankara"], seconds: 20 });
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ uid: `u${i}`, name: `Oyuncu ${i}`, joinedAt: i }));
const meta = (p: Partial<{ locked: boolean }> = {}) => ({
  hostUid: "h1",
  quizId: "q",
  title: "Genel kültür",
  createdAt: 0,
  questionCount: 3,
  ...p,
});

const ui = () => (
  <MemoryRouter initialEntries={["/host/game/123456"]}>
    <Routes>
      <Route path="/host/game/:pin" element={<HostGame />} />
    </Routes>
  </MemoryRouter>
);
const renderHost = () => render(ui());

const callsOf = (action: string) => vi.mocked(hostCall).mock.calls.filter(([a]) => a === action);

describe("HostGame", () => {
  beforeEach(() => {
    vi.mocked(hostCall).mockReset().mockResolvedValue({ ok: true } as never);
    vi.mocked(hooks.useGameState).mockReturnValue({ phase: "lobby", qIndex: -1, startedAt: 0, endsAt: 0, updatedAt: 0 });
    vi.mocked(hooks.useMeta).mockReturnValue(meta());
    vi.mocked(hooks.useQuestion).mockReturnValue(null);
    vi.mocked(hooks.useReveal).mockReturnValue(null);
    vi.mocked(hooks.useLeaderboard).mockReturnValue(null);
    vi.mocked(hooks.usePlayers).mockReturnValue(players(2));
    vi.mocked(hooks.useAnswerUids).mockReturnValue([]);
    vi.mocked(hooks.useServerNow).mockReturnValue(5_000);
  });

  it("lobby: shows the PIN, join URL, player names and count; Start calls the host dispatcher", async () => {
    renderHost();
    expect(screen.getByText("123456")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(window.location.host.replace(/[.:]/g, "\\$&")))).toBeInTheDocument();
    expect(screen.getByText("Oyuncu 0")).toBeInTheDocument();
    expect(screen.getByText("Oyuncu 1")).toBeInTheDocument();
    expect(screen.getByText(t("hostGame.playersOfMax", { count: 2, max: club.game.maxPlayers }))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.start") }));
    expect(hostCall).toHaveBeenCalledWith("startGame", { pin: "123456" });
  });

  it("has a sound toggle that remembers the choice", async () => {
    localStorage.removeItem("stage-sound-muted");
    const { unmount } = renderHost();
    const btn = screen.getByRole("button", { name: t("hostGame.sound") });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem("stage-sound-muted")).toBe("1");
    unmount();
    renderHost();
    expect(screen.getByRole("button", { name: t("hostGame.sound") })).toHaveAttribute("aria-pressed", "false");
    localStorage.removeItem("stage-sound-muted");
  });

  it("lobby: shows a QR code that opens the join page with the PIN", () => {
    renderHost();
    const qr = screen.getByRole("img", { name: t("hostGame.qrLabel") });
    expect(qr.getAttribute("data-url")).toBe(`${window.location.origin}/?pin=123456`);
  });

  it("lobby: a blocked nickname is masked on the projector (data untouched), duplicates are marked", async () => {
    vi.mocked(hooks.usePlayers).mockReturnValue([
      { uid: "u0", name: "Ali", joinedAt: 0 },
      { uid: "u1", name: "amk", joinedAt: 1 },
      { uid: "u2", name: "ALİ", joinedAt: 2 },
    ]);
    renderHost();
    expect(screen.queryByText("amk")).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/amk/i);
    const masked = screen.getByText(t("hostGame.maskedName", { n: 2 }));
    expect(masked.closest("li")).toHaveAttribute("data-masked", "true");
    expect(screen.getByText("Ali").closest("li")).toHaveAttribute("data-duplicate", "true");
    expect(screen.getByText("ALİ").closest("li")).toHaveAttribute("data-duplicate", "true");
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.kick", { name: t("hostGame.maskedName", { n: 2 }) }) }));
    expect(screen.getByRole("alertdialog")).not.toHaveTextContent(/amk/i);
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.kickConfirmOk") }));
    expect(hostCall).toHaveBeenCalledWith("kickPlayer", { pin: "123456", uid: "u1" });
  });

  it("mid-game panel and leaderboard mask blocked names too", async () => {
    vi.mocked(hooks.usePlayers).mockReturnValue([{ uid: "u0", name: "amk", joinedAt: 0 }]);
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(0), phase: "leaderboard" });
    vi.mocked(hooks.useLeaderboard).mockReturnValue({ top: [{ name: "amk", score: 10, rank: 1 }], playerCount: 1 });
    renderHost();
    await userEvent.click(screen.getByText(t("hostGame.playersPanel", { count: 1 })));
    expect(document.body.innerHTML).not.toMatch(/amk/i);
    expect(screen.getAllByText(t("hostGame.maskedName", { n: 1 })).length).toBeGreaterThanOrEqual(2);
  });

  it("lobby: shows count / max and a 'full' notice when the server marks the lobby full", () => {
    vi.mocked(hooks.useMeta).mockReturnValue({ ...meta(), full: true, playerCount: 2 });
    renderHost();
    expect(screen.getByText(t("hostGame.playersOfMax", { count: 2, max: club.game.maxPlayers }))).toBeInTheDocument();
    expect(screen.getByText(t("hostGame.lobbyFull"))).toBeInTheDocument();
  });

  it("lobby: Start is disabled without players", () => {
    vi.mocked(hooks.usePlayers).mockReturnValue([]);
    renderHost();
    expect(screen.getByRole("button", { name: t("hostGame.start") })).toBeDisabled();
  });

  it("lobby: × asks in an in-app dialog (no window.confirm); Cancel keeps, Remove kicks", async () => {
    const confirm = vi.spyOn(window, "confirm");
    renderHost();
    const kick = screen.getByRole("button", { name: t("hostGame.kick", { name: "Oyuncu 1" }) });
    await userEvent.click(kick);
    const dialog = screen.getByRole("alertdialog", { name: t("hostGame.kickConfirm", { name: "Oyuncu 1" }) });
    await userEvent.click(within(dialog).getByRole("button", { name: t("common.cancel") }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(callsOf("kickPlayer")).toHaveLength(0);
    await userEvent.click(kick);
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.kickConfirmOk") }));
    expect(hostCall).toHaveBeenCalledWith("kickPlayer", { pin: "123456", uid: "u1" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("lobby: Escape closes the kick dialog without kicking", async () => {
    renderHost();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.kick", { name: "Oyuncu 0" }) }));
    expect(screen.getByRole("button", { name: t("common.cancel") })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(callsOf("kickPlayer")).toHaveLength(0);
  });

  it("auto-reveal waits while a kick is in flight and fires after it finishes", async () => {
    let finishKick!: () => void;
    vi.mocked(hostCall).mockImplementation(((action: string) =>
      action === "kickPlayer" ? new Promise((r) => (finishKick = () => r({ ok: true }))) : Promise.resolve({ ok: true })) as never);
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(), phase: "question" });
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    vi.mocked(hooks.useServerNow).mockReturnValue(10_000);
    const { rerender } = renderHost();
    await userEvent.click(screen.getByText(t("hostGame.playersPanel", { count: 2 })));
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.kick", { name: "Oyuncu 0" }) }));
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.kickConfirmOk") }));
    expect(callsOf("kickPlayer")).toHaveLength(1);
    vi.mocked(hooks.useServerNow).mockReturnValue(20_400);
    rerender(ui());
    await new Promise((r) => setTimeout(r, 20));
    expect(callsOf("reveal")).toHaveLength(0);
    finishKick();
    await waitFor(() => expect(callsOf("reveal")).toHaveLength(1));
  });

  it("lobby: lock toggle calls setLobbyLocked and shows the locked state", async () => {
    const { unmount } = renderHost();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.lockLobby") }));
    expect(hostCall).toHaveBeenCalledWith("setLobbyLocked", { pin: "123456", locked: true });
    unmount();
    vi.mocked(hooks.useMeta).mockReturnValue(meta({ locked: true }));
    renderHost();
    expect(screen.getByText(t("hostGame.lobbyLocked"))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.unlockLobby") }));
    expect(hostCall).toHaveBeenCalledWith("setLobbyLocked", { pin: "123456", locked: false });
  });

  it("question: shows text, options and x / y answered; no reveal while time remains", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(qState());
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    vi.mocked(hooks.useAnswerUids).mockReturnValue(["u0"]);
    renderHost();
    expect(screen.getByText("Başkent?")).toBeInTheDocument();
    expect(screen.getByText("Ankara")).toBeInTheDocument();
    expect(screen.getByText(t("hostGame.answered", { answered: 1, total: 2 }))).toBeInTheDocument();
    expect(hooks.useAnswerUids).toHaveBeenCalledWith("123456", 0);
    expect(callsOf("reveal")).toHaveLength(0);
  });

  it("lead-in: before startedAt the stage says 'get ready' with a countdown instead of the timer", () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(), startedAt: 8_000, endsAt: 28_000 });
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    renderHost();
    expect(screen.getByText(t("hostGame.getReady"))).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("hostGame.reveal") })).toBeDisabled();
    // options stay hidden until answering opens
    expect(screen.getByText("Başkent?")).toBeInTheDocument();
    expect(screen.queryByText("Ankara")).not.toBeInTheDocument();
    expect(screen.queryByText("İzmir")).not.toBeInTheDocument();
  });

  it("options appear on the stage once the timer starts", () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(), startedAt: 4_000, endsAt: 24_000 });
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    renderHost();
    expect(screen.getByText("Ankara")).toBeInTheDocument();
    expect(screen.getByText("İzmir")).toBeInTheDocument();
  });

  it("auto-reveals once, 300 ms after endsAt (server clock), with the expected qIndex", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue(qState(1));
    vi.mocked(hooks.useQuestion).mockReturnValue(question(1));
    vi.mocked(hooks.useServerNow).mockReturnValue(20_299);
    const { rerender } = renderHost();
    await new Promise((r) => setTimeout(r, 20));
    expect(callsOf("reveal")).toHaveLength(0);
    vi.mocked(hooks.useServerNow).mockReturnValue(20_300);
    rerender(ui());
    await waitFor(() => expect(callsOf("reveal")).toHaveLength(1));
    expect(callsOf("reveal")[0][1]).toEqual({ pin: "123456", qIndex: 1 });
    vi.mocked(hooks.useServerNow).mockReturnValue(21_500);
    rerender(ui());
    await new Promise((r) => setTimeout(r, 20));
    expect(callsOf("reveal")).toHaveLength(1);
  });

  it("auto-reveals exactly once when all players answered; {already:true} is success", async () => {
    vi.mocked(hostCall).mockResolvedValue({ ok: true, already: true } as never);
    vi.mocked(hooks.useGameState).mockReturnValue(qState());
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    vi.mocked(hooks.useAnswerUids).mockReturnValue(["u0", "u1"]);
    renderHost();
    await waitFor(() => expect(callsOf("reveal")).toHaveLength(1));
    expect(screen.getByRole("button", { name: t("hostGame.reveal") })).toBeDisabled();
    await new Promise((r) => setTimeout(r, 20));
    expect(callsOf("reveal")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("answers of kicked players do not count: no early 'all answered' reveal", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue(qState());
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    vi.mocked(hooks.useAnswerUids).mockReturnValue(["u0", "kicked"]);
    renderHost();
    expect(screen.getByText(t("hostGame.answered", { answered: 1, total: 2 }))).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(callsOf("reveal")).toHaveLength(0);
  });

  it("manual Reveal calls reveal once and prevents a later auto-reveal", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue(qState());
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    const { rerender } = renderHost();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.reveal") }));
    expect(callsOf("reveal")).toHaveLength(1);
    vi.mocked(hooks.useServerNow).mockReturnValue(25_000);
    rerender(ui());
    await new Promise((r) => setTimeout(r, 20));
    expect(callsOf("reveal")).toHaveLength(1);
  });

  it("shows the server's message for a refused action", async () => {
    vi.mocked(hostCall).mockRejectedValue(
      Object.assign(new Error("Başlatmak için en az bir oyuncu gerekli."), { code: "functions/permission-denied" }),
    );
    renderHost();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.start") }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Başlatmak için en az bir oyuncu gerekli.");
  });

  it("retries once after lock contention (failed-precondition)", async () => {
    vi.mocked(hostCall)
      .mockRejectedValueOnce(Object.assign(new Error("Başka bir işlem sürüyor"), { code: "functions/failed-precondition" }))
      .mockResolvedValue({ ok: true } as never);
    renderHost();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.start") }));
    await waitFor(() => expect(callsOf("startGame")).toHaveLength(2), { timeout: 2000 });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reveal: shows the distribution counts and a button to the leaderboard (with qIndex)", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(), phase: "reveal" });
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    vi.mocked(hooks.useReveal).mockReturnValue({ qIndex: 0, correct: 1, counts: [4, 7] });
    renderHost();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Ankara").closest("[data-correct]")).toHaveAttribute("data-correct", "true");
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.showLeaderboard") }));
    expect(hostCall).toHaveBeenCalledWith("showLeaderboard", { pin: "123456", qIndex: 0 });
  });

  it("leaderboard: shows top 5 and Next (with qIndex); last question offers End", async () => {
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
    expect(hostCall).toHaveBeenCalledWith("nextQuestion", { pin: "123456", qIndex: 0 });
    unmount();

    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(2), phase: "leaderboard" });
    renderHost();
    expect(screen.queryByRole("button", { name: t("hostGame.next") })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.end") }));
    expect(hostCall).toHaveBeenCalledWith("endGame", { pin: "123456" });
  });

  it("mid-game: the players panel can remove a player", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(0), phase: "leaderboard" });
    renderHost();
    const panel = screen.getByText(t("hostGame.playersPanel", { count: 2 })).closest("details")!;
    await userEvent.click(within(panel).getByText(t("hostGame.playersPanel", { count: 2 })));
    await userEvent.click(within(panel).getByRole("button", { name: t("hostGame.kick", { name: "Oyuncu 0" }) }));
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.kickConfirmOk") }));
    expect(hostCall).toHaveBeenCalledWith("kickPlayer", { pin: "123456", uid: "u0" });
  });

  it("players panel: multi-select + 'remove selected' kicks in bulk with kickPlayers after confirmation", async () => {
    vi.mocked(hooks.usePlayers).mockReturnValue(players(3));
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(0), phase: "leaderboard" });
    renderHost();
    const panel = screen.getByText(t("hostGame.playersPanel", { count: 3 })).closest("details")!;
    await userEvent.click(within(panel).getByText(t("hostGame.playersPanel", { count: 3 })));
    const bulk = within(panel).getByRole("button", { name: t("hostGame.kickSelected", { count: 0 }) });
    expect(bulk).toBeDisabled();
    await userEvent.click(within(panel).getByRole("checkbox", { name: t("hostGame.select", { name: "Oyuncu 0" }) }));
    await userEvent.click(within(panel).getByRole("checkbox", { name: t("hostGame.select", { name: "Oyuncu 2" }) }));
    await userEvent.click(within(panel).getByRole("button", { name: t("hostGame.kickSelected", { count: 2 }) }));
    const dialog = screen.getByRole("alertdialog", { name: t("hostGame.kickManyConfirm", { count: 2 }) });
    await userEvent.click(within(dialog).getByRole("button", { name: t("hostGame.kickConfirmOk") }));
    expect(hostCall).toHaveBeenCalledWith("kickPlayers", { pin: "123456", uids: ["u0", "u2"] });
    expect(callsOf("kickPlayer")).toHaveLength(0);
  });

  it("players panel: cancelling the bulk confirmation keeps the selection", async () => {
    renderHost();
    await userEvent.click(screen.getByText(t("hostGame.playersPanel", { count: 2 })));
    await userEvent.click(screen.getByRole("checkbox", { name: t("hostGame.select", { name: "Oyuncu 1" }) }));
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.kickSelected", { count: 1 }) }));
    await userEvent.click(screen.getByRole("button", { name: t("common.cancel") }));
    expect(screen.getByRole("checkbox", { name: t("hostGame.select", { name: "Oyuncu 1" }) })).toBeChecked();
    expect(callsOf("kickPlayers")).toHaveLength(0);
  });

  it("players panel is available in the lobby too (bulk moderation of spam names)", async () => {
    renderHost();
    expect(screen.getByText(t("hostGame.playersPanel", { count: 2 }))).toBeInTheDocument();
  });

  it("shows a 'calculating' hint while a transition holds the lock", () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(), phase: "reveal", lock: { by: "showLeaderboard", at: 4_800 } });
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    renderHost();
    expect(screen.getByText(t("common.computing"))).toBeInTheDocument();
  });

  it("ended: detailed top 10 next to the podium, with correct counts", () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(2), phase: "ended" });
    const top = Array.from({ length: 11 }, (_, i) => ({
      name: `Oyuncu${i + 1}`,
      score: 1000 - i * 10,
      rank: i + 1,
      correctCount: 8 - (i % 3),
    }));
    vi.mocked(hooks.useLeaderboard).mockReturnValue({ top, playerCount: 11 });
    renderHost();
    const list = screen.getByRole("list", { name: t("ended.topTitle", { count: 10 }) });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(10);
    expect(within(rows[3]).getByText("Oyuncu4")).toBeInTheDocument();
    expect(within(rows[3]).getByText(t("leaderboard.correct", { count: 8 }))).toBeInTheDocument();
    expect(within(list).queryByText("Oyuncu11")).not.toBeInTheDocument();
  });

  it("leaderboard phase shows up to 10 rows", () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(0), phase: "leaderboard" });
    const top = Array.from({ length: 12 }, (_, i) => ({ name: `Oyuncu${i + 1}`, score: 100 - i, rank: i + 1 }));
    vi.mocked(hooks.useLeaderboard).mockReturnValue({ top, playerCount: 12 });
    renderHost();
    expect(screen.getByText("Oyuncu10")).toBeInTheDocument();
    expect(screen.queryByText("Oyuncu11")).not.toBeInTheDocument();
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
    const podium = screen.getByRole("list", { name: t("podium.title") });
    expect(within(podium).getByText("Ali")).toBeInTheDocument();
    expect(within(podium).getByText("Can")).toBeInTheDocument();
    expect(within(podium).queryByText("Dördüncü")).not.toBeInTheDocument();
    expect(screen.getByText(club.finalScreen[club.locale].title)).toBeInTheDocument();
    expect(screen.getByAltText(club.logo.alt)).toBeInTheDocument();
  });
});

