import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { translate } from "../i18n";
import { club } from "../club.config";
import { HostPage } from "./HostPage";
import { useHostAuth, useMyQuizzes, saveQuiz } from "../game/host";
import { validateQuiz } from "../../shared/quizValidate";
import { hostCall } from "../firebase";

vi.mock("../firebase", () => ({ hostCall: vi.fn() }));
vi.mock("../game/host", () => ({ useHostAuth: vi.fn(), useMyQuizzes: vi.fn(), saveQuiz: vi.fn() }));
vi.mock("../../shared/quizValidate", () => ({ validateQuiz: vi.fn() }));

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(club.locale, k, v);
const signIn = vi.fn();
const user = { uid: "h1", email: "host@example.org", displayName: "Host" };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/host"]}>
      <Routes>
        <Route path="/host" element={<HostPage />} />
        <Route path="/host/game/:pin" element={<div>BIG SCREEN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const validQuiz = { title: "Genel kültür", questions: [{ text: "S1", options: ["a", "b"], correct: 0 }] };

describe("HostPage", () => {
  beforeEach(() => {
    signIn.mockReset().mockResolvedValue(undefined);
    vi.mocked(useHostAuth).mockReturnValue({ status: "authorized", user, signIn, signOut: vi.fn() });
    vi.mocked(useMyQuizzes).mockReturnValue({
      quizzes: [{ id: "quiz1", title: "Tarih", questionCount: 7, updatedAt: 0 }],
      loading: false,
      error: null,
    });
    vi.mocked(saveQuiz).mockReset().mockResolvedValue("newId");
    vi.mocked(validateQuiz).mockReset();
    vi.mocked(hostCall).mockReset();
  });

  it("signed out: offers Google sign-in", async () => {
    vi.mocked(useHostAuth).mockReturnValue({ status: "signedOut", user: null, signIn, signOut: vi.fn() });
    renderPage();
    expect(screen.getByAltText(club.logo.alt)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("host.signIn") }));
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("not on the allow-list: shows not-authorized message", () => {
    vi.mocked(useHostAuth).mockReturnValue({ status: "unauthorized", user, signIn, signOut: vi.fn() });
    renderPage();
    expect(screen.getByText(t("host.notAuthorized", { email: user.email }))).toBeInTheDocument();
    expect(screen.queryByText(t("host.myQuizzes"))).not.toBeInTheDocument();
    expect(useMyQuizzes).not.toHaveBeenCalledWith("h1");
  });

  it("dashboard lists own quizzes", () => {
    renderPage();
    expect(useMyQuizzes).toHaveBeenCalledWith("h1");
    expect(screen.getByText("Tarih")).toBeInTheDocument();
    expect(screen.getByText(t("host.questionsCount", { count: 7 }))).toBeInTheDocument();
  });

  it("Start game calls createGame and opens the big screen", async () => {
    vi.mocked(hostCall).mockResolvedValue({ pin: "123456" });
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: t("host.createGame") }));
    expect(hostCall).toHaveBeenCalledWith("createGame", { quizId: "quiz1" });
    expect(await screen.findByText("BIG SCREEN")).toBeInTheDocument();
  });

  it("import: invalid JSON shows a parse error and saves nothing", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(t("host.importPaste")), { target: { value: "{nope" } });
    await userEvent.click(screen.getByRole("button", { name: t("host.importSave") }));
    expect(screen.getByRole("alert")).toHaveTextContent(t("host.importInvalidJson", { message: "" }).trim().slice(0, 10));
    expect(validateQuiz).not.toHaveBeenCalled();
    expect(saveQuiz).not.toHaveBeenCalled();
  });

  it("import: shows validateQuiz errors as a list and saves nothing", async () => {
    vi.mocked(validateQuiz).mockReturnValue({ ok: false, errors: ["questions[0].correct out of range", "title is required"] });
    renderPage();
    fireEvent.change(screen.getByLabelText(t("host.importPaste")), { target: { value: '{"title":""}' } });
    await userEvent.click(screen.getByRole("button", { name: t("host.importSave") }));
    expect(validateQuiz).toHaveBeenCalledWith({ title: "" });
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toContain("questions[0].correct out of range");
    expect(items).toContain("title is required");
    expect(saveQuiz).not.toHaveBeenCalled();
  });

  it("import: saves a valid quiz with the owner uid", async () => {
    vi.mocked(validateQuiz).mockReturnValue({ ok: true, quiz: validQuiz });
    renderPage();
    fireEvent.change(screen.getByLabelText(t("host.importPaste")), { target: { value: JSON.stringify(validQuiz) } });
    await userEvent.click(screen.getByRole("button", { name: t("host.importSave") }));
    expect(saveQuiz).toHaveBeenCalledWith("h1", validQuiz);
    expect(await screen.findByText(t("host.importSaved", { title: "Genel kültür" }))).toBeInTheDocument();
  });

  it("import: reads a chosen .json file", async () => {
    vi.mocked(validateQuiz).mockReturnValue({ ok: true, quiz: validQuiz });
    renderPage();
    const file = new File([JSON.stringify(validQuiz)], "quiz.json", { type: "application/json" });
    await userEvent.upload(screen.getByLabelText(t("host.importFile")), file);
    expect(await screen.findByDisplayValue(/Genel kültür/)).toBeInTheDocument();
  });
});
