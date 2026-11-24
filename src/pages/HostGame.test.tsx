import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { GameState, PublicQuestion } from "../../shared/types";
import { translate } from "../i18n";
import { club } from "../club.config";
import { HostGame } from "./HostGame";
import * as hooks from "../game/hooks";
import { hostCall } from "../firebase";
import { useHostPresence } from "../game/presence";

vi.mock("../firebase", () => ({ hostCall: vi.fn() }));
vi.mock("../game/connection", () => ({ useConnectionLost: () => false }));
vi.mock("../game/presence", () => ({ useHostPresence: vi.fn() }));
vi.mock("../game/host", () => ({
  useHostAuth: () => ({
    status: "authorized",
    user: { uid: "h1", email: "host@example.org", displayName: "Host" },
    signIn: vi.fn(),
    signUp: vi.fn(),
    resetPassword: vi.fn(),
    resendVerification: vi.fn(),
    refreshVerification: vi.fn(),
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

  it("lobby: a 'sound is off' banner shows while muted and turns the sound back on", async () => {
    localStorage.setItem("stage-sound-muted", "1");
    renderHost();
    const banner = screen.getByRole("button", { name: t("hostGame.soundOff") });
    await userEvent.click(banner);
    expect(screen.queryByRole("button", { name: t("hostGame.soundOff") })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("hostGame.sound") })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("stage-sound-muted")).toBeNull();
  });

  it("no 'sound is off' banner outside the lobby", () => {
    localStorage.setItem("stage-sound-muted", "1");
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(), phase: "reveal" });
    renderHost();
    expect(screen.queryByRole("button", { name: t("hostGame.soundOff") })).not.toBeInTheDocument();
    localStorage.removeItem("stage-sound-muted");
  });

  it("has separate music and effects volume sliders next to the sound toggle, remembered", async () => {
    localStorage.removeItem("stage-sound-levels");
    const { unmount } = renderHost();
    const open = screen.getByRole("button", { name: t("hostGame.soundVolume") });
    expect(open).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(open);
    expect(open).toHaveAttribute("aria-expanded", "true");
    const music = screen.getByRole("slider", { name: t("hostGame.musicVolume") });
    const sfx = screen.getByRole("slider", { name: t("hostGame.sfxVolume") });
    expect(Number((music as HTMLInputElement).value)).toBeLessThan(Number((sfx as HTMLInputElement).value));
    fireEvent.change(music, { target: { value: "20" } });
    expect(JSON.parse(localStorage.getItem("stage-sound-levels") ?? "{}").music).toBeCloseTo(0.2);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("slider", { name: t("hostGame.musicVolume") })).not.toBeInTheDocument();
    unmount();
    renderHost();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.soundVolume") }));
    expect(screen.getByRole("slider", { name: t("hostGame.musicVolume") })).toHaveValue("20");
    localStorage.removeItem("stage-sound-levels");
  });

  it("lobby: shows a QR code that opens the join page with the PIN", () => {
    renderHost();
    const qr = screen.getByRole("img", { name: t("hostGame.qrLabel") });
    expect(qr.getAttribute("data-url")).toBe(`${window.location.origin}/?pin=123456`);
  });

  it("lobby: the QR comes first, the PIN is secondary, and there is no PIN chip in the header", () => {
    renderHost();
    const qr = screen.getByRole("img", { name: t("hostGame.qrLabel") });
    const pin = screen.getByText("123456");
    expect(qr.compareDocumentPosition(pin) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(t("join.pinChip", { pin: "123456" }))).not.toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.revealEarlyConfirmOk") }));
    expect(callsOf("reveal")).toHaveLength(1);
    vi.mocked(hooks.useServerNow).mockReturnValue(25_000);
    rerender(ui());
    await new Promise((r) => setTimeout(r, 20));
    expect(callsOf("reveal")).toHaveLength(1);
  });

  it("early Reveal (time left, not everyone answered) asks first; Cancel does nothing", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue(qState());
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    vi.mocked(hooks.useAnswerUids).mockReturnValue(["u0"]);
    renderHost();
    const btn = screen.getByRole("button", { name: t("hostGame.reveal") });
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(screen.getByRole("alertdialog")).toHaveTextContent(t("hostGame.revealEarlyConfirm"));
    expect(callsOf("reveal")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: t("common.cancel") }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(callsOf("reveal")).toHaveLength(0);
  });

  it("early Reveal: confirming reveals once with the expected qIndex", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue(qState(1));
    vi.mocked(hooks.useQuestion).mockReturnValue(question(1));
    renderHost();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.reveal") }));
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.revealEarlyConfirmOk") }));
    await waitFor(() => expect(callsOf("reveal")).toHaveLength(1));
    expect(callsOf("reveal")[0][1]).toEqual({ pin: "123456", qIndex: 1 });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Reveal after time is up reveals immediately without asking", async () => {
    // auto-reveal waits for the 300 ms grace; the button acts right away
    vi.mocked(hooks.useGameState).mockReturnValue(qState());
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    vi.mocked(hooks.useServerNow).mockReturnValue(20_100);
    renderHost();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.reveal") }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(callsOf("reveal")).toHaveLength(1);
  });

  it("a pending early-reveal dialog closes when the auto-reveal fires; no double reveal, no error", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue(qState());
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    const { rerender } = renderHost();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.reveal") }));
    const confirmOk = screen.getByRole("button", { name: t("hostGame.revealEarlyConfirmOk") });
    vi.mocked(hooks.useServerNow).mockReturnValue(20_300);
    rerender(ui());
    await waitFor(() => expect(callsOf("reveal")).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    // a click that raced the auto-reveal is a no-op
    confirmOk.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(callsOf("reveal")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a pending early-reveal dialog closes when the question changes", async () => {
    vi.mocked(hooks.useGameState).mockReturnValue(qState(0));
    vi.mocked(hooks.useQuestion).mockReturnValue(question(0));
    const { rerender } = renderHost();
    await userEvent.click(screen.getByRole("button", { name: t("hostGame.reveal") }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(0), phase: "reveal" });
    rerender(ui());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    vi.mocked(hooks.useGameState).mockReturnValue(qState(1));
    vi.mocked(hooks.useQuestion).mockReturnValue(question(1));
    rerender(ui());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(callsOf("reveal")).toHaveLength(0);
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

  it("leaderboard: rows show movement (▲ up / ▼ down / nothing) and a streak badge from 2", () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(1), phase: "leaderboard" });
    vi.mocked(hooks.useLeaderboard).mockReturnValue({
      top: [
        { name: "Ali", score: 900, rank: 1, prevRank: 4, streak: 3 },
        { name: "Veli", score: 800, rank: 2, prevRank: 1, streak: 1 },
        { name: "Can", score: 700, rank: 3, prevRank: 3 },
        { name: "Yeni", score: 600, rank: 4 },
      ],
      playerCount: 4,
    });
    renderHost();
    const rows = within(screen.getByRole("list", { name: t("leaderboard.title") })).getAllByRole("listitem");
    expect(within(rows[0]).getByText("▲3")).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText(t("leaderboard.movedUp", { count: 3 }))).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText(t("leaderboard.streak", { streak: 3 }))).toBeInTheDocument();
    expect(within(rows[1]).getByText("▼1")).toBeInTheDocument();
    expect(within(rows[1]).getByLabelText(t("leaderboard.movedDown", { count: 1 }))).toBeInTheDocument();
    // streak 1 → no badge; unchanged / unknown → no arrow
    expect(within(rows[1]).queryByLabelText(t("leaderboard.streak", { streak: 1 }))).not.toBeInTheDocument();
    expect(within(rows[2]).queryByText(/[▲▼]/)).not.toBeInTheDocument();
    expect(within(rows[3]).queryByText(/[▲▼]/)).not.toBeInTheDocument();
    // FLIP: each row starts from its previous display position (in rows)
    expect(rows[0].style.getPropertyValue("--shift")).toBe("3");
    expect(rows[1].style.getPropertyValue("--shift")).toBe("-1");
    expect(rows[2].style.getPropertyValue("--shift")).toBe("0");
    expect(rows[3].style.getPropertyValue("--shift")).toBe("0");
    expect(rows[0]).toHaveAttribute("data-move", "up");
    expect(rows[1]).toHaveAttribute("data-move", "down");
    expect(rows[2]).not.toHaveAttribute("data-move");
  });

  it("ended list has no movement arrows (final standings only)", () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(2), phase: "ended" });
    vi.mocked(hooks.useLeaderboard).mockReturnValue({
      top: [{ name: "Ali", score: 900, rank: 1, prevRank: 2, streak: 3, correctCount: 3 }],
      playerCount: 1,
    });
    renderHost();
    const list = screen.getByRole("list", { name: t("ended.topTitle", { count: 10 }) });
    expect(within(list).queryByText("▲1")).not.toBeInTheDocument();
  });

  it("double-points question: a 2× badge on the stage, during the lead-in too", () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(), startedAt: 8_000, endsAt: 28_000 });
    vi.mocked(hooks.useQuestion).mockReturnValue({ ...question(), double: true });
    const { unmount } = renderHost();
    expect(screen.getByText(t("hostGame.getReady"))).toBeInTheDocument();
    expect(screen.getByText(t("question.double"))).toBeInTheDocument();
    unmount();
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(), startedAt: 4_000, endsAt: 24_000 });
    renderHost();
    expect(screen.getByText(t("question.double"))).toBeInTheDocument();
  });

  it("normal question: no 2× badge", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(qState());
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    renderHost();
    expect(screen.queryByText(t("question.double"))).not.toBeInTheDocument();
  });
  it("reveal: confetti and a 'got it right' headline when at least one player was correct", () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(), phase: "reveal" });
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    vi.mocked(hooks.useReveal).mockReturnValue({ qIndex: 0, correct: 1, counts: [4, 7] });
    renderHost();
    expect(document.querySelector(".stage-reveal .confetti")).not.toBeNull();
    expect(screen.getByText(t("hostGame.correctCount", { count: 7 }))).toBeInTheDocument();
  });

  it("reveal: no confetti when nobody got it right", () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(), phase: "reveal" });
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    vi.mocked(hooks.useReveal).mockReturnValue({ qIndex: 0, correct: 1, counts: [4, 0] });
    renderHost();
    expect(document.querySelector(".confetti")).toBeNull();
    expect(screen.getByText(t("hostGame.nobodyCorrect"))).toBeInTheDocument();
  });

  it("leaderboard: the biggest climber of the round gets a callout", () => {
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(1), phase: "leaderboard" });
    vi.mocked(hooks.useLeaderboard).mockReturnValue({
      top: [
        { name: "Ali", score: 900, rank: 1, prevRank: 1 },
        { name: "Veli", score: 800, rank: 2, prevRank: 5 },
        { name: "Can", score: 700, rank: 3, prevRank: 2 },
      ],
      playerCount: 3,
    });
    renderHost();
    const rows = within(screen.getByRole("list", { name: t("leaderboard.title") })).getAllByRole("listitem");
    expect(within(rows[1]).getByText(t("leaderboard.topClimber"))).toBeInTheDocument();
  });

  it("stage has a decorative animated backdrop that follows the phase", () => {
    renderHost();
    expect(document.querySelector(".stage-backdrop")).toHaveAttribute("data-phase", "lobby");
  });

  it("lobby: each name gets a stable colour picked from the player id", () => {
    const { unmount } = renderHost();
    const colours = screen.getAllByText(/^Oyuncu \d$/).map((el) => el.closest("li")!.getAttribute("data-choice"));
    unmount();
    renderHost();
    expect(screen.getAllByText(/^Oyuncu \d$/).map((el) => el.closest("li")!.getAttribute("data-choice"))).toEqual(colours);
    for (const c of colours) expect(Number(c)).toBeLessThan(club.choices.length);
  });

  it("double-points question: the stage gets the extra double flourish", () => {
    vi.mocked(hooks.useGameState).mockReturnValue(qState());
    vi.mocked(hooks.useQuestion).mockReturnValue({ ...question(), double: true });
    const { unmount } = renderHost();
    expect(document.querySelector(".stage-question")).toHaveAttribute("data-double");
    unmount();
    vi.mocked(hooks.useQuestion).mockReturnValue(question());
    renderHost();
    expect(document.querySelector(".stage-question")).not.toHaveAttribute("data-double");
  });

  describe("keyboard / presentation remote shortcuts", () => {
    const press = (key: string, target: Element | Window = window) =>
      fireEvent.keyDown(target, { key, code: key === " " ? "Space" : key });

    it("lobby: Space, Enter, PageDown and → start the game", async () => {
      for (const key of [" ", "Enter", "PageDown", "ArrowRight"]) {
        vi.mocked(hostCall).mockClear();
        const { unmount } = renderHost();
        press(key);
        await waitFor(() => expect(callsOf("startGame")).toHaveLength(1));
        unmount();
      }
    });

    it("lobby without players: nothing happens", () => {
      vi.mocked(hooks.usePlayers).mockReturnValue([]);
      renderHost();
      press(" ");
      expect(hostCall).not.toHaveBeenCalled();
    });

    it("question: an early reveal by keyboard still asks first", () => {
      vi.mocked(hooks.useGameState).mockReturnValue(qState(0));
      vi.mocked(hooks.useQuestion).mockReturnValue(question(0));
      renderHost();
      press("r");
      expect(screen.getByRole("alertdialog")).toHaveTextContent(t("hostGame.revealEarlyConfirm"));
      expect(callsOf("reveal")).toHaveLength(0);
    });

    it("reveal: Space shows the leaderboard; leaderboard: Space goes to the next question", async () => {
      vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(0), phase: "reveal" });
      const { unmount } = renderHost();
      press(" ");
      await waitFor(() => expect(callsOf("showLeaderboard")).toHaveLength(1));
      unmount();
      vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(0), phase: "leaderboard" });
      renderHost();
      press(" ");
      await waitFor(() => expect(callsOf("nextQuestion")).toHaveLength(1));
    });

    it("last leaderboard: the keyboard never ends the game (end needs a click)", () => {
      vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(2), phase: "leaderboard" });
      renderHost();
      press(" ");
      press("Enter");
      expect(callsOf("endGame")).toHaveLength(0);
    });

    it("ignores keys typed into a field or pressed on a focused button, and keys with modifiers", () => {
      renderHost();
      const input = document.createElement("input");
      document.body.appendChild(input);
      press(" ", input);
      press("Enter", screen.getByRole("button", { name: t("hostGame.sound") }));
      fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
      fireEvent.keyDown(window, { key: "r", ctrlKey: true });
      expect(callsOf("startGame")).toHaveLength(0);
      input.remove();
    });
  });

  it("marks the host as connected while the game runs (players see when the host drops)", () => {
    renderHost();
    expect(useHostPresence).toHaveBeenLastCalledWith("123456", true);
    vi.mocked(hooks.useGameState).mockReturnValue({ ...qState(0), phase: "ended" });
    renderHost();
    expect(useHostPresence).toHaveBeenLastCalledWith("123456", false);
  });
});

