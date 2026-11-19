import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { normalizeName, NAME_MAX } from "../../shared/names";
import { translate } from "../i18n";
import { club } from "../club.config";
import { JoinPage } from "./JoinPage";
import { checkGame, joinGame } from "../game/actions";
import { loadSession, saveSession } from "../game/session";

vi.mock("../firebase", () => ({ hostCall: vi.fn() }));
const offline = vi.hoisted(() => ({ value: false }));
vi.mock("../game/connection", () => ({ useOfflineFor: () => offline.value, useConnectionLost: () => false }));
vi.mock("../game/actions", () => ({
  checkGame: vi.fn(),
  joinGame: vi.fn(),
  submitAnswer: vi.fn(),
}));

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(club.locale, k, v);

function renderJoin(url = "/") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/" element={<JoinPage />} />
        <Route path="/play/:pin" element={<div>PLAY SCREEN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const pinInput = () => screen.getByLabelText(t("join.pinLabel"));
const continueBtn = () => screen.getByRole("button", { name: t("join.continue") });

describe("JoinPage", () => {
  beforeEach(() => {
    localStorage.clear();
    offline.value = false;
    vi.mocked(checkGame).mockReset().mockResolvedValue({ kind: "ok" });
    vi.mocked(joinGame).mockReset().mockResolvedValue("uid-1");
  });

  it("shows the club logo from config", () => {
    renderJoin();
    expect(screen.getByAltText(club.logo.alt)).toBeInTheDocument();
  });

  it("PIN input uses the numeric keypad and keeps only digits, max 6", async () => {
    renderJoin();
    const input = pinInput();
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("pattern", "[0-9]*");
    expect(input).toHaveAttribute("autocomplete", "off");
    await userEvent.type(input, "12a3-4 5678");
    expect(input).toHaveValue("123456");
  });

  it("Continue is disabled until the PIN is valid", async () => {
    renderJoin();
    expect(continueBtn()).toBeDisabled();
    await userEvent.type(pinInput(), "12345");
    expect(continueBtn()).toBeDisabled();
    await userEvent.type(pinInput(), "6");
    expect(continueBtn()).toBeEnabled();
  });

  it("rejects a 6-digit PIN that isValidPin refuses (leading zero)", async () => {
    renderJoin();
    await userEvent.type(pinInput(), "012345");
    expect(continueBtn()).toBeDisabled();
    expect(screen.getByText(t("join.pinInvalid"))).toBeInTheDocument();
  });

  it("shows an error when no game exists for the PIN", async () => {
    vi.mocked(checkGame).mockResolvedValue({ kind: "notFound" });
    renderJoin();
    await userEvent.type(pinInput(), "123456");
    await userEvent.click(continueBtn());
    expect(await screen.findByText(t("join.notFound"))).toBeInTheDocument();
    expect(screen.queryByLabelText(t("join.nameLabel"))).not.toBeInTheDocument();
  });

  it("validates nickname, normalizes it and calls joinGame, then goes to the play screen", async () => {
    renderJoin();
    await userEvent.type(pinInput(), "123456");
    await userEvent.click(continueBtn());
    expect(checkGame).toHaveBeenCalledWith("123456");

    const name = await screen.findByLabelText(t("join.nameLabel"));
    expect(name).toHaveAttribute("maxlength", String(NAME_MAX));
    const joinBtn = screen.getByRole("button", { name: t("join.join") });

    await userEvent.type(name, "a<b");
    await userEvent.click(joinBtn);
    expect(screen.getByText(t("join.nameInvalid"))).toBeInTheDocument();
    expect(joinGame).not.toHaveBeenCalled();

    await userEvent.clear(name);
    await userEvent.type(name, "  Ayşe    Nur ");
    await userEvent.click(joinBtn);
    expect(joinGame).toHaveBeenCalledTimes(1);
    expect(joinGame).toHaveBeenCalledWith("123456", normalizeName("  Ayşe    Nur "));
    expect(await screen.findByText("PLAY SCREEN")).toBeInTheDocument();
    expect(loadSession("123456")).toEqual({ pin: "123456", name: normalizeName("  Ayşe    Nur ") });
  });

  it("an empty nickname is rejected", async () => {
    renderJoin();
    await userEvent.type(pinInput(), "123456");
    await userEvent.click(continueBtn());
    await screen.findByLabelText(t("join.nameLabel"));
    await userEvent.type(screen.getByLabelText(t("join.nameLabel")), "   ");
    await userEvent.click(screen.getByRole("button", { name: t("join.join") }));
    expect(joinGame).not.toHaveBeenCalled();
    expect(screen.getByText(t("join.nameInvalid"))).toBeInTheDocument();
  });

  it("redirects to the play screen if a session is already stored (refresh)", async () => {
    saveSession({ pin: "654321", name: "Ali" });
    renderJoin();
    expect(await screen.findByText("PLAY SCREEN")).toBeInTheDocument();
  });

  async function enterPin() {
    renderJoin();
    await userEvent.type(pinInput(), "123456");
    await userEvent.click(continueBtn());
  }

  it("rejoins a game the player is already in (tab lost) with the server's name", async () => {
    vi.mocked(checkGame).mockResolvedValue({ kind: "rejoin", name: "Ali (2)" });
    await enterPin();
    expect(await screen.findByText("PLAY SCREEN")).toBeInTheDocument();
    expect(loadSession("123456")).toEqual({ pin: "123456", name: "Ali (2)" });
    expect(joinGame).not.toHaveBeenCalled();
  });

  it("banned player sees that they were removed", async () => {
    vi.mocked(checkGame).mockResolvedValue({ kind: "banned" });
    await enterPin();
    expect(await screen.findByText(t("join.banned"))).toBeInTheDocument();
  });

  it("locked lobby is explained", async () => {
    vi.mocked(checkGame).mockResolvedValue({ kind: "locked" });
    await enterPin();
    expect(await screen.findByText(t("join.locked"))).toBeInTheDocument();
  });

  it("full lobby is explained ('Lobi dolu')", async () => {
    vi.mocked(checkGame).mockResolvedValue({ kind: "full" });
    await enterPin();
    expect(await screen.findByText(t("join.full"))).toBeInTheDocument();
  });

  it("a join refused because the lobby filled up meanwhile says so", async () => {
    vi.mocked(joinGame).mockRejectedValue(Object.assign(new Error("PERMISSION_DENIED"), { code: "PERMISSION_DENIED" }));
    await enterPin();
    vi.mocked(checkGame).mockResolvedValue({ kind: "full" });
    await userEvent.type(await screen.findByLabelText(t("join.nameLabel")), "Ayşe");
    await userEvent.click(screen.getByRole("button", { name: t("join.join") }));
    expect(await screen.findByText(t("join.full"))).toBeInTheDocument();
  });

  it("maps auth/too-many-requests to a friendly hint", async () => {
    vi.mocked(checkGame).mockRejectedValue(Object.assign(new Error("Firebase: Error (auth/too-many-requests)."), { code: "auth/too-many-requests" }));
    await enterPin();
    expect(await screen.findByText(t("errors.tooManyRequests"))).toBeInTheDocument();
  });

  it("a join refused by the rules re-checks the room and explains why (lobby got locked)", async () => {
    vi.mocked(joinGame).mockRejectedValue(Object.assign(new Error("PERMISSION_DENIED"), { code: "PERMISSION_DENIED" }));
    await enterPin();
    vi.mocked(checkGame).mockResolvedValue({ kind: "locked" });
    await userEvent.type(await screen.findByLabelText(t("join.nameLabel")), "Ayşe");
    await userEvent.click(screen.getByRole("button", { name: t("join.join") }));
    expect(await screen.findByText(t("join.locked"))).toBeInTheDocument();
  });

  it("blocks an inappropriate nickname client-side", async () => {
    await enterPin();
    const bad = Buffer.from("c2lrdGly", "base64").toString();
    await userEvent.type(await screen.findByLabelText(t("join.nameLabel")), bad);
    await userEvent.click(screen.getByRole("button", { name: t("join.join") }));
    expect(screen.getByText(t("join.nameNotAllowed"))).toBeInTheDocument();
    expect(joinGame).not.toHaveBeenCalled();
  });

  it("hints at mobile data when the live connection does not come up", () => {
    offline.value = true;
    renderJoin();
    expect(screen.getByText(t("join.slowNetwork"))).toBeInTheDocument();
  });

  it("shows a short privacy notice with the club name and retention from config", () => {
    renderJoin();
    expect(screen.getByText(t("join.privacyStored", { club: club.name }))).toBeInTheDocument();
    expect(screen.getByText(t("join.privacyRetention", { days: club.game.resultsRetentionDays }))).toBeInTheDocument();
    expect(screen.getByText(t("join.privacyNickname"))).toBeInTheDocument();
  });

  it("arriving with ?pin= checks right away and rejoins a returning player", async () => {
    vi.mocked(checkGame).mockResolvedValue({ kind: "rejoin", name: "Ali" });
    renderJoin("/?pin=123456");
    expect(await screen.findByText("PLAY SCREEN")).toBeInTheDocument();
    expect(checkGame).toHaveBeenCalledWith("123456");
  });

  it("shows the invalid-PIN message when redirected from a bad link", () => {
    renderJoin("/?invalid=1");
    expect(screen.getByText(t("app.invalidPin"))).toBeInTheDocument();
  });
});
