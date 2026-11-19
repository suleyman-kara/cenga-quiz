import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { normalizeName, NAME_MAX } from "../../shared/names";
import { translate } from "../i18n";
import { club } from "../club.config";
import { JoinPage } from "./JoinPage";
import { checkGame, joinGame } from "../game/actions";

vi.mock("../firebase", () => ({ call: vi.fn() }));
vi.mock("../game/actions", () => ({
  checkGame: vi.fn(),
  joinGame: vi.fn(),
  submitAnswer: vi.fn(),
}));

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(club.locale, k, v);

function renderJoin() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
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
    sessionStorage.clear();
    vi.mocked(checkGame).mockReset().mockResolvedValue("ok");
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
    vi.mocked(checkGame).mockResolvedValue("notFound");
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
    expect(JSON.parse(sessionStorage.getItem("quiz.session")!)).toEqual({
      pin: "123456",
      name: normalizeName("  Ayşe    Nur "),
    });
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
    sessionStorage.setItem("quiz.session", JSON.stringify({ pin: "654321", name: "Ali" }));
    renderJoin();
    expect(await screen.findByText("PLAY SCREEN")).toBeInTheDocument();
  });
});
